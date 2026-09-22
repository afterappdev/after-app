import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import * as bcrypt from 'bcrypt';
import { AppleAuthTokensService } from '../auth/apple-auth-tokens.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaCleanupService } from '../uploads/media-cleanup.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaCleanup: MediaCleanupService,
    private readonly appleTokens: AppleAuthTokensService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
        venue: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return {
      ...user,
      venueId: user.venue?.id ?? null,
    };
  }

  async updateMe(
    userId: string,
    data: {
      name?: string;
      city?: string;
      state?: string;
      avatarUrl?: string | null;
    },
  ) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatarUrl: true },
    });
    if (!current) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        city: data.city,
        state: data.state,
        avatarUrl:
          data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
      },
    });

    if (data.avatarUrl !== undefined) {
      const nextAvatar = data.avatarUrl || null;
      if (current.avatarUrl && current.avatarUrl !== nextAvatar) {
        await this.mediaCleanup.deleteStoredUpload(current.avatarUrl);
      }
    }

    return updated;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException(
        'A senha deverá conter no mínimo 6 caracteres.',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true };
  }

  async listBlockedVenues(user: AuthUser) {
    this.assertConsumerUser(user);
    const rows = await this.prisma.userVenueBlock.findMany({
      where: { userId: user.userId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      venueId: row.venueId,
      createdAt: row.createdAt,
      venue: row.venue,
    }));
  }

  async blockVenue(user: AuthUser, venueId: string) {
    this.assertConsumerUser(user);
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ownerUserId: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (venue.ownerUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode bloquear o próprio estabelecimento',
      );
    }

    const block = await this.prisma.userVenueBlock.upsert({
      where: { userId_venueId: { userId: user.userId, venueId } },
      create: { userId: user.userId, venueId },
      update: {},
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            city: true,
            state: true,
          },
        },
      },
    });
    await this.prisma.favorite.deleteMany({
      where: { userId: user.userId, venueId },
    });
    return {
      id: block.id,
      venueId: block.venueId,
      createdAt: block.createdAt,
      venue: block.venue,
    };
  }

  async unblockVenue(user: AuthUser, venueId: string) {
    this.assertConsumerUser(user);
    await this.prisma.userVenueBlock.deleteMany({
      where: { userId: user.userId, venueId },
    });
    return { ok: true };
  }

  private assertConsumerUser(user: AuthUser) {
    if (user.role !== Role.USER) {
      throw new ForbiddenException(
        'Apenas contas de cliente podem bloquear estabelecimentos',
      );
    }
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        appleId: true,
        appleRefreshTokenEnc: true,
        appleClientId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
    }

    await this.appleTokens.revokeForAccount(user);

    const urls = await this.deleteUserRecord(this.prisma, userId);
    await this.mediaCleanup.deleteStoredUploads(urls);
    return { ok: true };
  }

  async deleteUserRecord(
    db: PrismaService | Prisma.TransactionClient,
    userId: string,
  ): Promise<Array<string | null | undefined>> {
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        venue: {
          include: {
            photos: { select: { url: true } },
            banners: { select: { imageUrl: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
    }

    const urls: Array<string | null | undefined> = [user.avatarUrl];
    if (user.venue) {
      urls.push(user.venue.logoUrl, user.venue.coverUrl);
      urls.push(...user.venue.photos.map((photo) => photo.url));
      urls.push(...user.venue.banners.map((banner) => banner.imageUrl));
    }

    await this.deleteRelatedOnboarding(db, {
      email: user.email,
      appleId: user.appleId,
      googleId: user.googleId,
    });
    await db.user.delete({ where: { id: userId } });
    return urls;
  }

  private async deleteRelatedOnboarding(
    db: PrismaService | Prisma.TransactionClient,
    user: { email: string; appleId: string | null; googleId: string | null },
  ) {
    const or: Prisma.SocialOnboardingTokenWhereInput[] = [
      { email: user.email },
    ];
    if (user.appleId) {
      or.push({ provider: 'apple', providerId: user.appleId });
    }
    if (user.googleId) {
      or.push({ provider: 'google', providerId: user.googleId });
    }
    await db.socialOnboardingToken.deleteMany({ where: { OR: or } });
  }
}
