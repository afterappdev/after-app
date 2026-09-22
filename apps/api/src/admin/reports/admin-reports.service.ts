import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BannerStatus,
  Prisma,
  ReportModerationAction,
  ReportStatus,
  ReportTargetType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaCleanupService } from '../../uploads/media-cleanup.service';
import { paginate, paginationMeta } from '../pagination';
import { ModerateReportDto } from './admin-reports.dto';
import { AdminReportsQueryDto } from './admin-reports.query';

const PUBLIC_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  description: true,
  status: true,
  targetSnapshot: true,
  moderationAction: true,
  adminNote: true,
  resolvedAt: true,
  contentRestoredAt: true,
  createdAt: true,
  updatedAt: true,
  reporter: { select: { id: true, name: true, role: true } },
  reviewedBy: { select: { id: true, name: true } },
  contentRestoredBy: { select: { id: true, name: true } },
} satisfies Prisma.ReportSelect;

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaCleanup: MediaCleanupService,
  ) {}

  async list(query: AdminReportsQueryDto) {
    const { page, limit, skip } = paginate(query.page, query.limit);
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.targetType) where.targetType = query.targetType;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: PUBLIC_SELECT,
      }),
    ]);

    return {
      items: rows.map((row) => this.serialize(row)),
      ...paginationMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!report) {
      throw new NotFoundException('Denúncia não encontrada');
    }
    return this.serialize(report, {
      venueHidden: await this.isVenueHidden(report),
    });
  }

  /**
   * Reexibe um VENUE ocultado por moderação.
   * Preserva a denúncia e o status histórico; só zera moderationHiddenAt
   * e registra quem restaurou e quando.
   */
  async restoreVenue(adminId: string, id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Denúncia não encontrada');
    }
    if (report.targetType !== ReportTargetType.VENUE) {
      throw new BadRequestException(
        'Somente estabelecimentos ocultados por moderação podem ser reexibidos por esta ação.',
      );
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: report.targetId },
      select: { id: true, moderationHiddenAt: true },
    });
    if (!venue) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (!venue.moderationHiddenAt) {
      throw new BadRequestException('Este estabelecimento já está visível.');
    }

    const now = new Date();
    await this.prisma.venue.update({
      where: { id: venue.id },
      data: { moderationHiddenAt: null },
    });

    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: {
        contentRestoredAt: now,
        contentRestoredById: adminId,
      },
      select: PUBLIC_SELECT,
    });

    return this.serialize(updated, { venueHidden: false });
  }

  async moderate(adminId: string, id: string, dto: ModerateReportDto) {
    const report = await this.prisma.report.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Denúncia não encontrada');
    }
    if (
      report.status === ReportStatus.RESOLVED ||
      report.status === ReportStatus.REJECTED
    ) {
      throw new BadRequestException('Esta denúncia já foi encerrada.');
    }

    const nextStatus = dto.status;
    if (
      nextStatus !== ReportStatus.REVIEWING &&
      nextStatus !== ReportStatus.RESOLVED &&
      nextStatus !== ReportStatus.REJECTED
    ) {
      throw new BadRequestException('Status inválido para moderação.');
    }

    const terminal =
      nextStatus === ReportStatus.RESOLVED ||
      nextStatus === ReportStatus.REJECTED;
    const shouldRemove =
      dto.removeContent === true && nextStatus === ReportStatus.RESOLVED;

    let moderationAction: ReportModerationAction = report.moderationAction;
    if (shouldRemove) {
      moderationAction = await this.applyContentAction(
        report.targetType,
        report.targetId,
      );
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: nextStatus,
        adminNote:
          dto.adminNote === undefined
            ? undefined
            : dto.adminNote.trim() || null,
        reviewedById: adminId,
        resolvedAt: terminal ? new Date() : null,
        activeKey: terminal ? null : report.activeKey,
        moderationAction,
      },
      select: PUBLIC_SELECT,
    });

    return this.serialize(updated);
  }

  private async applyContentAction(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportModerationAction> {
    switch (targetType) {
      case ReportTargetType.VENUE: {
        const venue = await this.prisma.venue.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!venue) return ReportModerationAction.NONE;
        await this.prisma.venue.update({
          where: { id: targetId },
          data: { moderationHiddenAt: new Date() },
        });
        return ReportModerationAction.VENUE_HIDDEN;
      }
      case ReportTargetType.BANNER: {
        const updated = await this.prisma.banner.updateMany({
          where: { id: targetId, status: { not: BannerStatus.CANCELLED } },
          data: { status: BannerStatus.CANCELLED },
        });
        return updated.count > 0
          ? ReportModerationAction.CONTENT_REMOVED
          : ReportModerationAction.NONE;
      }
      case ReportTargetType.PHOTO:
      case ReportTargetType.VIDEO: {
        const photo = await this.prisma.venuePhoto.findUnique({
          where: { id: targetId },
          include: {
            venue: { select: { logoUrl: true, coverUrl: true } },
          },
        });
        if (!photo) return ReportModerationAction.NONE;
        await this.prisma.venuePhoto.delete({ where: { id: targetId } });
        if (
          photo.url &&
          photo.url !== photo.venue.logoUrl &&
          photo.url !== photo.venue.coverUrl
        ) {
          await this.mediaCleanup.deleteStoredUpload(photo.url);
        }
        return ReportModerationAction.CONTENT_REMOVED;
      }
      case ReportTargetType.REVIEW: {
        const deleted = await this.prisma.review.deleteMany({
          where: { id: targetId },
        });
        return deleted.count > 0
          ? ReportModerationAction.CONTENT_REMOVED
          : ReportModerationAction.NONE;
      }
      default:
        return ReportModerationAction.NONE;
    }
  }

  private async isVenueHidden(
    report: Pick<
      Prisma.ReportGetPayload<{ select: typeof PUBLIC_SELECT }>,
      'targetType' | 'targetId'
    >,
  ): Promise<boolean> {
    if (report.targetType !== ReportTargetType.VENUE) {
      return false;
    }
    const venue = await this.prisma.venue.findUnique({
      where: { id: report.targetId },
      select: { moderationHiddenAt: true },
    });
    return venue?.moderationHiddenAt != null;
  }

  private serialize(
    row: Prisma.ReportGetPayload<{ select: typeof PUBLIC_SELECT }>,
    extras: { venueHidden?: boolean } = {},
  ) {
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      description: row.description,
      status: row.status,
      targetSnapshot: row.targetSnapshot,
      moderationAction: row.moderationAction,
      adminNote: row.adminNote,
      resolvedAt: row.resolvedAt,
      contentRestoredAt: row.contentRestoredAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      reporter: row.reporter,
      reviewedBy: row.reviewedBy,
      contentRestoredBy: row.contentRestoredBy,
      venueHidden: extras.venueHidden ?? false,
    };
  }
}
