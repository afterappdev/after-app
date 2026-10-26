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

const activeOwner = { accountStatus: 'ACTIVE' as const };

function publicVenue(overrides: Record<string, unknown> = {}) {
  return {
    moderationHiddenAt: null,
    owner: activeOwner,
    ...overrides,
  };
}

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
      ...publicVenue(),
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
      venue: {
        id: 'venue-1',
        name: 'Bar',
        ownerUserId: 'owner-1',
        ...publicVenue(),
      },
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
      ...publicVenue(),
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
      ...publicVenue(),
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
      venue: { id: 'venue-1', name: 'Bar', ...publicVenue() },
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
      owner: activeOwner,
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

  it('estabelecimento com dono pendente de exclusão não pode ser denunciado', async () => {
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
      ...publicVenue({ owner: { accountStatus: 'PENDING_DELETION' } }),
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
        ...publicVenue(),
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

describe('ReportsService notifica o Admin só depois de gravar', () => {
  function withPush() {
    const prisma = createPrisma();
    const push = {
      notifyReportCreated: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReportsService(prisma as never, push as never);
    return { prisma, push, service };
  }

  const venue = {
    id: 'venue-1',
    name: 'Bar Central',
    description: 'descrição interna',
    city: 'Campinas',
    state: 'SP',
    category: 'Bar',
    logoUrl: null,
    coverUrl: null,
    ownerUserId: 'owner-1',
    ...publicVenue(),
  };

  it('denúncia de estabelecimento dispara um push com o nome do local', async () => {
    const { prisma, push, service } = withPush();
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.report.create.mockResolvedValue({
      id: 'report-1',
      status: 'PENDING',
      createdAt: new Date('2026-10-08T12:00:00.000Z'),
    });

    const result = await service.create(user, {
      targetType: ReportTargetType.VENUE,
      targetId: 'venue-1',
      reason: ReportReason.SPAM,
      description: 'texto completo da denúncia',
    });

    expect(result.id).toBe('report-1');
    expect(push.notifyReportCreated).toHaveBeenCalledTimes(1);
    expect(push.notifyReportCreated).toHaveBeenCalledWith({
      id: 'report-1',
      targetType: 'VENUE',
      reason: 'SPAM',
      snapshot: expect.objectContaining({ name: 'Bar Central' }),
    });
    const payload = push.notifyReportCreated.mock.calls[0][0] as {
      description?: string;
    };
    expect(payload.description).toBeUndefined();
  });

  it('denúncia de promoção usa o fluxo existente', async () => {
    const { prisma, push, service } = withPush();
    prisma.banner.findUnique.mockResolvedValue({
      id: 'banner-1',
      title: 'Happy hour',
      description: 'segredo',
      imageUrl: null,
      status: 'ACTIVE',
      venueId: 'venue-1',
      venue: {
        id: 'venue-1',
        name: 'Bar Central',
        ownerUserId: 'owner-1',
        ...publicVenue(),
      },
    });
    prisma.report.create.mockResolvedValue({
      id: 'report-2',
      status: 'PENDING',
      createdAt: new Date(),
    });

    await service.create(user, {
      targetType: ReportTargetType.BANNER,
      targetId: 'banner-1',
      reason: ReportReason.MISLEADING,
    });

    expect(push.notifyReportCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-2',
        targetType: 'BANNER',
        reason: 'MISLEADING',
        snapshot: expect.objectContaining({ venueName: 'Bar Central' }),
      }),
    );
  });

  it('denúncia duplicada ou inválida não dispara push', async () => {
    const duplicate = withPush();
    duplicate.prisma.venue.findUnique.mockResolvedValue(venue);
    duplicate.prisma.report.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(
      duplicate.service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(duplicate.push.notifyReportCreated).not.toHaveBeenCalled();

    const missing = withPush();
    missing.prisma.venue.findUnique.mockResolvedValue(null);
    await expect(
      missing.service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'missing',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(missing.push.notifyReportCreated).not.toHaveBeenCalled();

    const own = withPush();
    own.prisma.venue.findUnique.mockResolvedValue({
      ...venue,
      ownerUserId: 'user-1',
    });
    await expect(
      own.service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(own.push.notifyReportCreated).not.toHaveBeenCalled();
  });

  it('falha ao salvar não dispara push', async () => {
    const { prisma, push, service } = withPush();
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.report.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).rejects.toThrow('db down');
    expect(push.notifyReportCreated).not.toHaveBeenCalled();
  });

  it('falha do FCM depois de gravar mantém a denúncia', async () => {
    const { prisma, push, service } = withPush();
    prisma.venue.findUnique.mockResolvedValue(venue);
    prisma.report.create.mockResolvedValue({
      id: 'report-1',
      status: 'PENDING',
      createdAt: new Date(),
    });
    push.notifyReportCreated.mockRejectedValue(new Error('fcm down'));

    await expect(
      service.create(user, {
        targetType: ReportTargetType.VENUE,
        targetId: 'venue-1',
        reason: ReportReason.SPAM,
      }),
    ).resolves.toMatchObject({ id: 'report-1' });
  });
});
