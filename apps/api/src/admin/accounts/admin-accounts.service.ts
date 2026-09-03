import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, paginationMeta } from '../pagination';
import { AdminAccountsQueryDto } from './admin-accounts.query';

const CONSUMER_ROLES: Role[] = [Role.USER, Role.VENUE];

@Injectable()
export class AdminAccountsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return where;
  }
}
