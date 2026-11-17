import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountLifecycleStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const LIST_CAP = 10_000;

const userSelect = {
  id: true,
  name: true,
  email: true,
  city: true,
  state: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminEventoService {
  constructor(private readonly prisma: PrismaService) {}

  private activeUserWhere(since?: Date) {
    return {
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
      ...(since ? { createdAt: { gt: since } } : {}),
    };
  }

  async snapshot() {
    const where = {
      role: Role.USER,
      accountStatus: AccountLifecycleStatus.ACTIVE,
    };

    const [total, users, checks] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP,
        select: userSelect,
      }),
      this.prisma.eventoUserCheck.findMany({
        select: { userId: true, checked: true, updatedAt: true },
      }),
    ]);

    const checkMap: Record<string, { checked: boolean; updatedAt: string }> =
      {};
    for (const row of checks) {
      checkMap[row.userId] = {
        checked: row.checked,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    return {
      total,
      items: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
      truncated: total > users.length,
      checks: checkMap,
      serverTime: new Date().toISOString(),
    };
  }

  async feed(sinceRaw: string) {
    const since = this.parseSince(sinceRaw);
    const users = await this.prisma.user.findMany({
      where: this.activeUserWhere(since),
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: userSelect,
    });
    const checkRows =
      users.length > 0
        ? await this.prisma.eventoUserCheck.findMany({
            where: { userId: { in: users.map((u) => u.id) } },
            select: { userId: true, checked: true, updatedAt: true },
          })
        : [];
    const checks: Record<string, { checked: boolean; updatedAt: string }> =
      {};
    for (const row of checkRows) {
      checks[row.userId] = {
        checked: row.checked,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    return {
      items: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
      checks,
      serverTime: new Date().toISOString(),
    };
  }

  async setChecked(userId: string, checked: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, accountStatus: true },
    });
    if (!user || user.role !== Role.USER) {
      throw new NotFoundException('Usuário app não encontrado');
    }
    if (user.accountStatus !== AccountLifecycleStatus.ACTIVE) {
      throw new BadRequestException('Conta não está ativa');
    }
    const row = await this.prisma.eventoUserCheck.upsert({
      where: { userId },
      create: { userId, checked },
      update: { checked },
      select: { userId: true, checked: true, updatedAt: true },
    });
    return {
      userId: row.userId,
      checked: row.checked,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseSince(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Parâmetro since inválido (ISO 8601).');
    }
    return date;
  }
}