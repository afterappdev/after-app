import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MediaType, ReportReason, ReportTargetType } from '@prisma/client';
import { ReportsService } from './reports.service';

function createPrisma() {
  return {
    venue: { findUnique: jest.fn() },
    banner: { findUnique: jest.fn() },
    venuePhoto: { findUnique: jest.fn() },
    review: { findUnique: jest.fn() },
    report: { create: jest.fn() },
  };
}

const user = {
  userId: 'user-1',
  email: 'user@after.local',
  role: 'USER' as const,
};

describe('ReportsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: ReportsService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new ReportsService(prisma as never);
  });

  it('USER denuncia estabelecimento válido', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      name: 'Bar Central',
      description: null,
      city: 'Campinas',
      state: 'SP',
      category: 'Bar',
      logoUrl: null,
      coverUrl: null,
      ownerUserId: 'owner-1',
    });
    prisma.report.create.mockResolvedValue({
      id: 'report-1',
      status: 'PENDING',
      createdAt: new Date('2026-09-22T12:00:00.000Z'),
    });

    const result = await service.create(user, {
      targetType: ReportTargetType.VENUE,
      targetId: 'venue-1',
      reason: ReportReason.SPAM,
    });

    expect(result.id).toBe('report-1');
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reporterId: 'user-1',
          targetType: 'VENUE',
          targetId: 'venue-1',
          reason: 'SPAM',
          activeKey: 'user-1:VENUE:venue-1',
        }),
      }),
    );
  });

  it('conteúdo inexistente não pode ser denunciado', async () => {
    prisma.venue.findUnique.mockResolvedValue(null);
    await expect(
      service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'missing',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('foto denunciada como vídeo é recusada', async () => {
    prisma.venuePhoto.findUnique.mockResolvedValue({
      id: 'photo-1',
      url: 'https://example.com/a.jpg',
      kind: 'GALLERY',
      mediaType: MediaType.IMAGE,
      venueId: 'venue-1',
      venue: { id: 'venue-1', name: 'Bar', ownerUserId: 'owner-1' },
    });
    await expect(
      service.create(user, {
        targetType: ReportTargetType.VIDEO,
        targetId: 'photo-1',
        reason: ReportReason.SEXUAL,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('duplicidade ativa retorna conflito', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      name: 'Bar Central',
      description: null,
      city: 'Campinas',
      state: 'SP',
      category: 'Bar',
      logoUrl: null,
      coverUrl: null,
      ownerUserId: 'owner-1',
    });
    prisma.report.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(
      service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('VENUE não denuncia o próprio estabelecimento', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      name: 'Bar Central',
      description: null,
      city: 'Campinas',
      state: 'SP',
      category: 'Bar',
      logoUrl: null,
      coverUrl: null,
      ownerUserId: 'user-1',
    });
    await expect(
      service.create(
        { ...user, role: 'VENUE' },
        {
          targetType: ReportTargetType.VENUE,
          targetId: 'venue-1',
          reason: ReportReason.SPAM,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('USER não denuncia a própria avaliação', async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: 'review-1',
      rating: 1,
      testimonial: 'Ruim',
      userId: 'user-1',
      venueId: 'venue-1',
      venue: { id: 'venue-1', name: 'Bar' },
      user: { id: 'user-1', name: 'Ana' },
    });
    await expect(
      service.create(user, {
        targetType: ReportTargetType.REVIEW,
        targetId: 'review-1',
        reason: ReportReason.HATE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN não usa o fluxo público de denúncia', async () => {
    await expect(
      service.create(
        { ...user, role: 'ADMIN' },
        {
          targetType: ReportTargetType.VENUE,
          targetId: 'venue-1',
          reason: ReportReason.SPAM,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VENUE ocultado por moderação não pode ser denunciado', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      name: 'Bar Central',
      description: null,
      city: 'Campinas',
      state: 'SP',
      category: 'Bar',
      logoUrl: null,
      coverUrl: null,
      ownerUserId: 'owner-1',
      moderationHiddenAt: new Date('2026-09-22T12:00:00.000Z'),
    });
    await expect(
      service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('promoção não pública não pode ser denunciada', async () => {
    prisma.banner.findUnique.mockResolvedValue({
      id: 'banner-1',
      title: 'Rascunho',
      description: null,
      imageUrl: null,
      status: 'DRAFT',
      venueId: 'venue-1',
      venue: {
        id: 'venue-1',
        name: 'Bar',
        ownerUserId: 'owner-1',
        moderationHiddenAt: null,
      },
    });
    await expect(
      service.create(user, {
        targetType: ReportTargetType.BANNER,
        targetId: 'banner-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.report.create).not.toHaveBeenCalled();
  });
});
