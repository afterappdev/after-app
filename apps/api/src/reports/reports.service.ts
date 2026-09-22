import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BannerStatus,
  MediaType,
  Prisma,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const CONTENT_GONE = 'Conteúdo não encontrado';
const ALREADY_REPORTED = 'Você já denunciou este conteúdo.';

type TargetSnapshot = Record<string, unknown>;

type ResolvedTarget = {
  snapshot: TargetSnapshot;
  ownerUserId?: string | null;
  authorUserId?: string | null;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: {
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    description?: string;
  }) {
    if (user.role !== 'USER' && user.role !== 'VENUE') {
      throw new ForbiddenException();
    }

    const target = await this.resolveTarget(dto.targetType, dto.targetId);
    if (target.ownerUserId && target.ownerUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode denunciar o próprio conteúdo',
      );
    }
    if (target.authorUserId && target.authorUserId === user.userId) {
      throw new ForbiddenException(
        'Você não pode denunciar o próprio conteúdo',
      );
    }

    const description = dto.description?.trim() || null;
    const activeKey = this.activeKey(
      user.userId,
      dto.targetType,
      dto.targetId,
    );

    try {
      const report = await this.prisma.report.create({
        data: {
          reporterId: user.userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          description,
          status: ReportStatus.PENDING,
          targetSnapshot: target.snapshot as Prisma.InputJsonValue,
          activeKey,
        },
        select: { id: true, status: true, createdAt: true },
      });
      return report;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'P2002') {
        throw new ConflictException(ALREADY_REPORTED);
      }
      throw error;
    }
  }

  private activeKey(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ) {
    return `${reporterId}:${targetType}:${targetId}`;
  }

  private async resolveTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ResolvedTarget> {
    switch (targetType) {
      case ReportTargetType.VENUE:
        return this.resolveVenue(targetId);
      case ReportTargetType.BANNER:
        return this.resolveBanner(targetId);
      case ReportTargetType.PHOTO:
        return this.resolvePhoto(targetId, MediaType.IMAGE);
      case ReportTargetType.VIDEO:
        return this.resolvePhoto(targetId, MediaType.VIDEO);
      case ReportTargetType.REVIEW:
        return this.resolveReview(targetId);
      default:
        throw new NotFoundException(CONTENT_GONE);
    }
  }

  private async resolveVenue(id: string): Promise<ResolvedTarget> {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        city: true,
        state: true,
        category: true,
        logoUrl: true,
        coverUrl: true,
        ownerUserId: true,
        moderationHiddenAt: true,
      },
    });
    if (!venue || venue.moderationHiddenAt) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    return {
      ownerUserId: venue.ownerUserId,
      snapshot: {
        type: 'VENUE',
        id: venue.id,
        name: venue.name,
        description: venue.description,
        city: venue.city,
        state: venue.state,
        category: venue.category,
        logoUrl: venue.logoUrl,
        coverUrl: venue.coverUrl,
      },
    };
  }

  private async resolveBanner(id: string): Promise<ResolvedTarget> {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        status: true,
        venueId: true,
        venue: {
          select: { id: true, name: true, ownerUserId: true, moderationHiddenAt: true },
        },
      },
    });
    if (!banner || banner.status !== BannerStatus.ACTIVE) {
      throw new NotFoundException(CONTENT_GONE);
    }
    if (banner.venue.moderationHiddenAt) {
      throw new NotFoundException(CONTENT_GONE);
    }
    return {
      ownerUserId: banner.venue.ownerUserId,
      snapshot: {
        type: 'BANNER',
        id: banner.id,
        title: banner.title,
        description: banner.description,
        imageUrl: banner.imageUrl,
        status: banner.status,
        venueId: banner.venue.id,
        venueName: banner.venue.name,
      },
    };
  }

  private async resolvePhoto(
    id: string,
    expected: MediaType,
  ): Promise<ResolvedTarget> {
    const photo = await this.prisma.venuePhoto.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        kind: true,
        mediaType: true,
        venueId: true,
        venue: {
          select: { id: true, name: true, ownerUserId: true, moderationHiddenAt: true },
        },
      },
    });
    if (!photo || photo.mediaType !== expected) {
      throw new NotFoundException(CONTENT_GONE);
    }
    if (photo.venue.moderationHiddenAt) {
      throw new NotFoundException(CONTENT_GONE);
    }
    return {
      ownerUserId: photo.venue.ownerUserId,
      snapshot: {
        type: expected === MediaType.VIDEO ? 'VIDEO' : 'PHOTO',
        id: photo.id,
        url: photo.url,
        kind: photo.kind,
        mediaType: photo.mediaType,
        venueId: photo.venue.id,
        venueName: photo.venue.name,
      },
    };
  }

  private async resolveReview(id: string): Promise<ResolvedTarget> {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        id: true,
        rating: true,
        testimonial: true,
        userId: true,
        venueId: true,
        venue: { select: { id: true, name: true, moderationHiddenAt: true } },
        user: { select: { id: true, name: true } },
      },
    });
    if (!review) {
      throw new NotFoundException(CONTENT_GONE);
    }
    if (review.venue.moderationHiddenAt) {
      throw new NotFoundException(CONTENT_GONE);
    }
    return {
      authorUserId: review.userId,
      snapshot: {
        type: 'REVIEW',
        id: review.id,
        rating: review.rating,
        testimonial: review.testimonial,
        venueId: review.venue.id,
        venueName: review.venue.name,
        authorId: review.user.id,
        authorName: review.user.name,
      },
    };
  }
}
