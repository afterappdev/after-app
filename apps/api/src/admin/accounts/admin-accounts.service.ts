import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminPurgeStrategy } from '../../users/users.service';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import {
  consumerTotals,
  countUsersByAgeBand,
  countVenuesByCategory,
  listConsumerCityLocations,
} from '../aggregates';
import { paginate, paginationMeta } from '../pagination';
import { AdminAccountsQueryDto } from './admin-accounts.query';
import { AdminAccountsStatsQueryDto } from './admin-accounts.stats.query';

const CONSUMER_ROLES: Role[] = [Role.USER, Role.VENUE];

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async cities() {
    return { items: await listConsumerCityLocations(this.prisma) };
  }

  async list(query: AdminAccountsQueryDto) {
    const { page, limit, skip } = paginate(query.page, query.limit);
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          state: true,
          city: true,
          createdAt: true,
          venue: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      items: rows.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        state: user.state,
        city: user.city,
        createdAt: user.createdAt,
        venueId: user.venue?.id ?? null,
        venueName: user.venue?.name ?? null,
      })),
      ...paginationMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        accountStatus: true,
        deletionRequestedAt: true,
        permanentDeletionAt: true,
        deletionCancelledAt: true,
        venue: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            city: true,
            state: true,
            logoUrl: true,
            coverUrl: true,
            createdAt: true,
            wallet: { select: { balance: true } },
          },
        },
      },
    });

    if (!user || user.role === Role.ADMIN) {
      throw new NotFoundException('Conta não encontrada');
    }

    const job = await this.prisma.accountPurgeJob.findUnique({
      where: { userId: id },
      select: {
        status: true,
        attempts: true,
        progressStage: true,
        scheduledFor: true,
        cancelledAt: true,
        completedAt: true,
        lastError: true,
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      state: user.state,
      city: user.city,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lifecycle: {
        accountStatus: user.accountStatus,
        deletionRequestedAt: user.deletionRequestedAt,
        permanentDeletionAt: user.permanentDeletionAt,
        deletionCancelledAt: user.deletionCancelledAt,
      },
      purgeJob: job
        ? {
            status: job.status,
            attempts: job.attempts,
            progressStage: job.progressStage,
            scheduledFor: job.scheduledFor,
            cancelledAt: job.cancelledAt,
            completedAt: job.completedAt,
            lastError: job.lastError
              ? job.lastError.slice(0, 200)
              : null,
          }
        : null,
      venue: user.venue
        ? {
            id: user.venue.id,
            name: user.venue.name,
            description: user.venue.description,
            category: user.venue.category,
            city: user.venue.city,
            state: user.venue.state,
            logoUrl: user.venue.logoUrl,
            coverUrl: user.venue.coverUrl,
            createdAt: user.venue.createdAt,
            creditBalance: user.venue.wallet?.balance ?? 0,
          }
        : null,
    };
  }

  async stats(query: AdminAccountsStatsQueryDto) {
    const totals = await consumerTotals(this.prisma);
    const city = query.city?.trim();
    const state = query.state?.trim()?.toUpperCase();

    const usersByAgeBand = await countUsersByAgeBand(this.prisma, {});
    const venuesByCategory = await countVenuesByCategory(this.prisma);

    let cityScope: {
      city: string;
      state: string;
      users: number;
      venues: number;
      usersByAgeBand: Awaited<ReturnType<typeof countUsersByAgeBand>>;
      venuesByCategory: Awaited<ReturnType<typeof countVenuesByCategory>>;
    } | null = null;

    if (city && state) {
      const [users, venues] = await Promise.all([
        this.prisma.user.count({
          where: { role: Role.USER, city, state },
        }),
        this.prisma.venue.count({ where: { city, state } }),
      ]);
      cityScope = {
        city,
        state,
        users,
        venues,
        usersByAgeBand: await countUsersByAgeBand(this.prisma, { city, state }),
        venuesByCategory: await countVenuesByCategory(this.prisma, city, state),
      };
    }

    return {
      totals,
      usersByAgeBand,
      venuesByCategory,
      cityScope,
    };
  }

  async remove(id: string, strategy: AdminPurgeStrategy = 'hard') {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Conta não encontrada');
    }
    if (user.role === Role.ADMIN) {
      throw new BadRequestException(
        'Conta administrativa não pode ser excluída.',
      );
    }

    const result = await this.users.purgeAccountPermanently(id, {
      strategy,
      auditSource: 'admin',
    });
    return { success: true, outcome: result.outcome };
  }

  private buildWhere(query: AdminAccountsQueryDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      role: query.role ? { equals: query.role } : { in: CONSUMER_ROLES },
    };
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { venue: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    this.applyCityStateFilter(where, query.city, query.state);
    return where;
  }

  private applyCityStateFilter(
    where: Prisma.UserWhereInput,
    cityRaw?: string,
    stateRaw?: string,
  ): void {
    const city = cityRaw?.trim();
    const state = stateRaw?.trim()?.toUpperCase();
    if (city && !state) {
      throw new BadRequestException(
        'Informe state (UF) junto com city para filtrar contas.',
      );
    }
    if (state && !city) {
      throw new BadRequestException(
        'Informe city junto com state para filtrar contas.',
      );
    }
    if (city && state) {
      where.city = city;
      where.state = state;
    }
  }
}
