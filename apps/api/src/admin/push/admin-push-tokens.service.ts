import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminPushTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, token: string, platform: string) {
    const saved = await this.prisma.adminDeviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return {
      id: saved.id,
      platform: saved.platform,
      updatedAt: saved.updatedAt,
    };
  }

  async unregister(userId: string, token: string) {
    await this.prisma.adminDeviceToken.deleteMany({
      where: { userId, token },
    });
    return { removed: true };
  }
}
