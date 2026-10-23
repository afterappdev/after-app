import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { promoPushLocationMaxAgeMs } from './promo-push.config';

const PLATFORMS = new Set(['android', 'ios', 'web']);

@Injectable()
export class PromoPushAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: LocationsService,
  ) {}

  async getPreferences(userId: string, now = new Date()) {
    const user = await this.requireUser(userId);
    const ibgeCityId = await this.ensureRegisteredIbge(user);
    return this.present(user, ibgeCityId, now);
  }

  async setEnabled(userId: string, enabled: boolean, now = new Date()) {
    await this.requireUser(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { promoNotificationsEnabled: enabled },
      select: this.userSelect(),
    });
    const ibgeCityId = await this.ensureRegisteredIbge(user);
    return this.present(user, ibgeCityId, now);
  }

  async setLocation(
    userId: string,
    input: {
      clear?: boolean;
      ibgeCityId?: number;
      city?: string;
      state?: string;
    },
    now = new Date(),
  ) {
    const user = await this.requireUser(userId);
    if (input.clear && (input.ibgeCityId != null || input.city || input.state)) {
      throw new BadRequestException('Pedido de localização ambíguo');
    }
    if (input.clear) {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          lastAuthorizedIbgeCityId: null,
          lastAuthorizedCityAt: null,
        },
        select: this.userSelect(),
      });
      return this.present(updated, updated.ibgeCityId, now);
    }

    const ibgeCityId = await this.resolveLocationInput(input);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastAuthorizedIbgeCityId: ibgeCityId,
        lastAuthorizedCityAt: now,
      },
      select: this.userSelect(),
    });
    const registered = await this.ensureRegisteredIbge(updated);
    return this.present(updated, registered, now);
  }

  async registerToken(userId: string, token: string, platform: string) {
    await this.requireUser(userId);
    const normalized = token.trim();
    if (!PLATFORMS.has(platform)) {
      throw new BadRequestException('Plataforma inválida');
    }
    const saved = await this.prisma.devicePushToken.upsert({
      where: { token: normalized },
      create: {
        userId,
        token: normalized,
        platform,
        disabledAt: null,
      },
      update: {
        userId,
        platform,
        disabledAt: null,
      },
    });
    const user = await this.requireUser(userId);
    await this.ensureRegisteredIbge(user);
    return {
      id: saved.id,
      platform: saved.platform,
      updatedAt: saved.updatedAt,
    };
  }

  async unregisterToken(userId: string, token: string) {
    const normalized = token.trim();
    const owned = await this.prisma.devicePushToken.findUnique({
      where: { token: normalized },
      select: { id: true, userId: true, disabledAt: true },
    });
    if (!owned || owned.userId !== userId) {
      return { removed: false };
    }
    if (!owned.disabledAt) {
      await this.prisma.devicePushToken.update({
        where: { id: owned.id },
        data: { disabledAt: new Date() },
      });
    }
    return { removed: true };
  }

  private async resolveLocationInput(input: {
    ibgeCityId?: number;
    city?: string;
    state?: string;
  }): Promise<number> {
    const hasName = Boolean(input.city?.trim() || input.state?.trim());
    if (input.ibgeCityId == null && !hasName) {
      throw new BadRequestException('Informe o município');
    }
    if (hasName && (!input.city?.trim() || !input.state?.trim())) {
      throw new BadRequestException('Informe cidade e UF');
    }
    let fromName: number | null = null;
    if (input.city?.trim() && input.state?.trim()) {
      fromName = await this.locations.resolveMunicipalityId(
        input.city,
        input.state,
      );
      if (fromName == null) {
        throw new BadRequestException('Município não identificado');
      }
    }
    if (input.ibgeCityId != null) {
      const exists = await this.locations.hasMunicipality(input.ibgeCityId);
      if (!exists) {
        throw new BadRequestException('Município não identificado');
      }
      if (fromName != null && fromName !== input.ibgeCityId) {
        throw new BadRequestException('Município não identificado');
      }
      return input.ibgeCityId;
    }
    if (fromName == null) {
      throw new BadRequestException('Município não identificado');
    }
    return fromName;
  }

  private async ensureRegisteredIbge(user: {
    id: string;
    city: string;
    state: string;
    ibgeCityId: number | null;
  }): Promise<number | null> {
    if (user.ibgeCityId != null) return user.ibgeCityId;
    const resolved = await this.locations.resolveMunicipalityId(
      user.city,
      user.state,
    );
    if (resolved == null) return null;
    await this.prisma.user.updateMany({
      where: { id: user.id, ibgeCityId: null },
      data: { ibgeCityId: resolved },
    });
    return resolved;
  }

  private present(
    user: {
      promoNotificationsEnabled: boolean;
      city: string;
      state: string;
      lastAuthorizedIbgeCityId: number | null;
      lastAuthorizedCityAt: Date | null;
    },
    ibgeCityId: number | null,
    now: Date,
  ) {
    const maxAge = promoPushLocationMaxAgeMs();
    const at = user.lastAuthorizedCityAt;
    const locationFresh =
      user.lastAuthorizedIbgeCityId != null &&
      at != null &&
      now.getTime() - at.getTime() >= 0 &&
      now.getTime() - at.getTime() <= maxAge;
    return {
      enabled: user.promoNotificationsEnabled,
      ibgeCityId,
      city: user.city,
      state: user.state,
      lastAuthorizedIbgeCityId: user.lastAuthorizedIbgeCityId,
      lastAuthorizedCityAt: at ? at.toISOString() : null,
      locationFresh,
    };
  }

  private userSelect() {
    return {
      id: true,
      city: true,
      state: true,
      ibgeCityId: true,
      promoNotificationsEnabled: true,
      lastAuthorizedIbgeCityId: true,
      lastAuthorizedCityAt: true,
    } as const;
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect(),
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
}
