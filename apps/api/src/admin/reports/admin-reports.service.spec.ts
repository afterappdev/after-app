import { ReportStatus, ReportTargetType } from '@prisma/client';
import { AdminReportsService } from './admin-reports.service';

function createPrisma() {
  return {
    report: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      $transaction: undefined as unknown,
    },
    venue: { findUnique: jest.fn(), update: jest.fn() },
    banner: { updateMany: jest.fn() },
    venuePhoto: { findUnique: jest.fn(), delete: jest.fn() },
    review: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

describe('AdminReportsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let mediaCleanup: { deleteStoredUpload: jest.Mock };
  let service: AdminReportsService;

  beforeEach(() => {
    prisma = createPrisma();
    prisma.$transaction = jest.fn(async (ops: unknown[]) => {
      const values = [];
      for (const op of ops as Array<Promise<unknown>>) {
        values.push(await op);
      }
      return values;
    });
    mediaCleanup = { deleteStoredUpload: jest.fn() };
    service = new AdminReportsService(
      prisma as never,
      mediaCleanup as never,
    );
  });

  it('listagem respeita filtro de status', async () => {
    prisma.report.count.mockResolvedValue(1);
    prisma.report.findMany.mockResolvedValue([
      {
        id: 'r1',
        targetType: ReportTargetType.VENUE,
        targetId: 'v1',
        reason: 'SPAM',
        description: null,
        status: ReportStatus.PENDING,
        targetSnapshot: { name: 'Bar' },
        moderationAction: 'NONE',
        adminNote: null,
        resolvedAt: null,
        contentRestoredAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        reporter: { id: 'u1', name: 'Ana', role: 'USER' },
        reviewedBy: null,
        contentRestoredBy: null,
      },
    ]);

    const result = await service.list({ status: ReportStatus.PENDING });
    expect(result.total).toBe(1);
    expect(prisma.report.count).toHaveBeenCalledWith({
      where: { status: ReportStatus.PENDING },
    });
  });

  it('resolução registra admin e timestamp', async () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      status: ReportStatus.PENDING,
      targetType: ReportTargetType.VENUE,
      targetId: 'v1',
      activeKey: 'u1:VENUE:v1',
      moderationAction: 'NONE',
    });
    prisma.report.update.mockResolvedValue({
      id: 'r1',
      targetType: ReportTargetType.VENUE,
      targetId: 'v1',
      reason: 'SPAM',
      description: null,
      status: ReportStatus.RESOLVED,
      targetSnapshot: {},
      moderationAction: 'NONE',
      adminNote: 'ok',
      resolvedAt: now,
      contentRestoredAt: null,
      createdAt: now,
      updatedAt: now,
      reporter: { id: 'u1', name: 'Ana', role: 'USER' },
      reviewedBy: { id: 'admin-1', name: 'Admin' },
      contentRestoredBy: null,
    });

    const result = await service.moderate('admin-1', 'r1', {
      status: ReportStatus.RESOLVED,
      adminNote: 'ok',
    });

    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReportStatus.RESOLVED,
          reviewedById: 'admin-1',
          resolvedAt: now,
          activeKey: null,
        }),
      }),
    );
    expect(result.reviewedBy).toEqual({ id: 'admin-1', name: 'Admin' });
    expect(result.resolvedAt).toEqual(now);
    jest.useRealTimers();
  });

  it('restaura VENUE ocultado sem alterar status histórico da denúncia', async () => {
    const now = new Date('2026-09-22T16:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    prisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      targetType: ReportTargetType.VENUE,
      targetId: 'v1',
      status: ReportStatus.RESOLVED,
      moderationAction: 'VENUE_HIDDEN',
      reviewedById: 'admin-hide',
      resolvedAt: new Date('2026-09-22T15:00:00.000Z'),
    });
    prisma.venue.findUnique.mockResolvedValue({
      id: 'v1',
      moderationHiddenAt: new Date('2026-09-22T15:00:00.000Z'),
    });
    prisma.venue.update.mockResolvedValue({
      id: 'v1',
      moderationHiddenAt: null,
    });
    prisma.report.update.mockResolvedValue({
      id: 'r1',
      targetType: ReportTargetType.VENUE,
      targetId: 'v1',
      reason: 'SPAM',
      description: null,
      status: ReportStatus.RESOLVED,
      targetSnapshot: { name: 'Bar' },
      moderationAction: 'VENUE_HIDDEN',
      adminNote: 'ocultado',
      resolvedAt: new Date('2026-09-22T15:00:00.000Z'),
      contentRestoredAt: now,
      createdAt: now,
      updatedAt: now,
      reporter: { id: 'u1', name: 'Ana', role: 'USER' },
      reviewedBy: { id: 'admin-hide', name: 'Admin' },
      contentRestoredBy: { id: 'admin-1', name: 'Admin' },
    });

    const result = await service.restoreVenue('admin-1', 'r1');

    expect(prisma.venue.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { moderationHiddenAt: null },
    });
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contentRestoredAt: now,
          contentRestoredById: 'admin-1',
        },
      }),
    );
    expect(prisma.report.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(result.status).toBe(ReportStatus.RESOLVED);
    expect(result.moderationAction).toBe('VENUE_HIDDEN');
    expect(result.venueHidden).toBe(false);
    expect(result.contentRestoredBy).toEqual({ id: 'admin-1', name: 'Admin' });
    expect(prisma.report.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ delete: expect.anything() }),
    );
    jest.useRealTimers();
  });

  it('não restaura estabelecimento já visível', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: 'r1',
      targetType: ReportTargetType.VENUE,
      targetId: 'v1',
      status: ReportStatus.RESOLVED,
    });
    prisma.venue.findUnique.mockResolvedValue({
      id: 'v1',
      moderationHiddenAt: null,
    });

    await expect(service.restoreVenue('admin-1', 'r1')).rejects.toThrow(
      'Este estabelecimento já está visível.',
    );
    expect(prisma.venue.update).not.toHaveBeenCalled();
    expect(prisma.report.update).not.toHaveBeenCalled();
  });
});
