import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type VipCreditMovement = {
  applied: boolean;
  vipBalance: number;
  balanceDelta: number;
};

@Injectable()
export class VipCreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds VIP credits once per operationKey. A repeated key does not
   * credit the wallet again and never converts common credits.
   */
  grant(
    input: {
      venueId: string;
      operationKey: string;
      credits: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<VipCreditMovement> {
    return this.apply(
      {
        ...input,
        kind: 'grant',
        direction: 1,
      },
      tx,
    );
  }

  /**
   * Removes unused VIP credits without taking the balance below zero.
   * The same operationKey does not refund twice.
   */
  refund(
    input: {
      venueId: string;
      operationKey: string;
      credits: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<VipCreditMovement> {
    return this.apply(
      {
        ...input,
        kind: 'refund',
        direction: -1,
      },
      tx,
    );
  }

  private apply(
    input: {
      venueId: string;
      operationKey: string;
      credits: number;
      kind: 'grant' | 'refund';
      direction: 1 | -1;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<VipCreditMovement> {
    if (!Number.isInteger(input.credits) || input.credits < 1) {
      throw new BadRequestException('Quantidade de créditos VIP inválida');
    }
    if (tx) return this.write(tx, input);
    return this.prisma.$transaction((inner) => this.write(inner, input));
  }

  private async write(
    tx: Prisma.TransactionClient,
    input: {
      venueId: string;
      operationKey: string;
      credits: number;
      kind: 'grant' | 'refund';
      direction: 1 | -1;
    },
  ): Promise<VipCreditMovement> {
    await this.lockWallet(tx, input.venueId);
    const existing = await tx.vipCreditEntry.findUnique({
        where: { operationKey: input.operationKey },
      });
      if (existing) {
        if (existing.venueId !== input.venueId || existing.kind !== input.kind) {
          throw new BadRequestException('Lançamento VIP divergente');
        }
        if (input.kind === 'grant' && existing.balanceDelta < 1) {
          throw new BadRequestException('Lançamento VIP sem crédito');
        }
        const wallet = await tx.creditWallet.findUnique({
          where: { venueId: input.venueId },
        });
        return {
          applied: false,
          vipBalance: wallet?.vipBalance ?? 0,
          balanceDelta: 0,
        };
      }
      const current = await tx.creditWallet.findUnique({
        where: { venueId: input.venueId },
      });
      const available = current?.vipBalance ?? 0;
      const magnitude =
        input.direction === 1 ? input.credits : Math.min(available, input.credits);
      const balanceDelta = magnitude === 0 ? 0 : magnitude * input.direction;
      const inserted = await tx.vipCreditEntry.createMany({
        data: {
          venueId: input.venueId,
          operationKey: input.operationKey,
          kind: input.kind,
          credits: input.credits,
          balanceDelta,
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        return {
          applied: false,
          vipBalance: available,
          balanceDelta: 0,
        };
      }
      if (balanceDelta !== 0) {
        await tx.creditWallet.upsert({
          where: { venueId: input.venueId },
          create: {
            venueId: input.venueId,
            balance: 0,
            vipBalance: Math.max(0, balanceDelta),
          },
          update: { vipBalance: { increment: balanceDelta } },
        });
      } else if (!current) {
        await tx.creditWallet.create({
          data: { venueId: input.venueId, balance: 0, vipBalance: 0 },
        });
      }
      const wallet = await tx.creditWallet.findUnique({
        where: { venueId: input.venueId },
      });
      return {
        applied: true,
        vipBalance: wallet?.vipBalance ?? 0,
        balanceDelta,
      };
  }

  /**
   * Writes the refund entry before touching vipBalance.
   * `balanceDelta` is the purchase-scoped plan: 0 or -1.
   * The common balance column is not part of this update.
   */
  async applyPlannedRefund(
    tx: Prisma.TransactionClient,
    input: {
      venueId: string;
      operationKey: string;
      balanceDelta: number;
    },
  ): Promise<VipCreditMovement> {
    if (input.balanceDelta > 0 || input.balanceDelta < -1) {
      throw new BadRequestException('Reembolso VIP inválido');
    }
    await this.lockWallet(tx, input.venueId);
    const existing = await tx.vipCreditEntry.findUnique({
      where: { operationKey: input.operationKey },
    });
    if (existing) {
      if (existing.venueId !== input.venueId || existing.kind !== 'refund') {
        throw new BadRequestException('Lançamento VIP divergente');
      }
      const wallet = await tx.creditWallet.findUnique({
        where: { venueId: input.venueId },
      });
      return {
        applied: false,
        vipBalance: wallet?.vipBalance ?? 0,
        balanceDelta: 0,
      };
    }
    const inserted = await tx.vipCreditEntry.createMany({
      data: {
        venueId: input.venueId,
        operationKey: input.operationKey,
        kind: 'refund',
        credits: 1,
        balanceDelta: input.balanceDelta,
      },
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const wallet = await tx.creditWallet.findUnique({
        where: { venueId: input.venueId },
      });
      return {
        applied: false,
        vipBalance: wallet?.vipBalance ?? 0,
        balanceDelta: 0,
      };
    }
    if (input.balanceDelta !== 0) {
      const updated = await tx.creditWallet.updateMany({
        where: {
          venueId: input.venueId,
          vipBalance: { gte: -input.balanceDelta },
        },
        data: { vipBalance: { increment: input.balanceDelta } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Saldo VIP insuficiente para o estorno');
      }
    }
    const wallet = await tx.creditWallet.findUnique({
      where: { venueId: input.venueId },
    });
    return {
      applied: true,
      vipBalance: wallet?.vipBalance ?? 0,
      balanceDelta: input.balanceDelta,
    };
  }

  async lockWallet(tx: Prisma.TransactionClient, venueId: string) {
    if (typeof tx.$queryRaw !== 'function') return;
    await tx.$queryRaw`
      SELECT "venueId" FROM "CreditWallet"
      WHERE "venueId" = ${venueId}
      FOR UPDATE
    `;
  }
}
