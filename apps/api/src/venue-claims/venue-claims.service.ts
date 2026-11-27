import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Role,
  VenueClaimStatus,
  VenueProfileKind,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AFTER_STANDARD_OWNER_USER_ID } from '../venues/venue-standard-profile';
import { isPublishedStandardVenue } from '../venues/venue-standard-profile';
import { ApproveVenueClaimDto, SubmitVenueClaimDto } from './venue-claims.dto';
import {
  VENUE_CLAIM_EMAIL_CODE_MAX_ATTEMPTS,
  VENUE_CLAIM_EMAIL_CODE_TTL_MS,
  VENUE_CLAIM_INVITE_TTL_MS,
  buildVenueClaimAcceptUrl,
  generateVenueClaimEmailCode,
  generateVenueClaimInviteToken,
  hashVenueClaimEmailCode,
  hashVenueClaimInviteToken,
} from './venue-claim-invite.crypto';
import {
  notifyTeamNewVenueClaim,
  sendVenueClaimEmailConfirmCode,
  sendVenueClaimInviteEmail,
  sendVenueClaimRequesterAck,
} from './venue-claim-mail';

@Injectable()
export class VenueClaimsService {
  private readonly logger = new Logger(VenueClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private webPublicBase(): string {
    return (
      this.config.get<string>('WEB_PUBLIC_BASE_URL')?.trim().replace(/\/$/, '') ??
      'https://app-after.com.br'
    );
  }

  private adminClaimsUrl(): string {
    return `${this.webPublicBase()}/admin/#/contas/reivindicacoes`;
  }

  async submit(venueId: string, dto: SubmitVenueClaimDto) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        profileKind: true,
        standardProfileStatus: true,
        moderationHiddenAt: true,
      },
    });
    if (!venue || venue.profileKind !== VenueProfileKind.STANDARD) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }
    if (!isPublishedStandardVenue(venue) || venue.moderationHiddenAt) {
      throw new BadRequestException('Este perfil não aceita reivindicações.');
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.venueClaim.count({
      where: {
        email: dto.email.trim().toLowerCase(),
        createdAt: { gte: since },
      },
    });
    if (recent >= 5) {
      throw new HttpException(
        'Muitas solicitações. Tente novamente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const open = await this.prisma.venueClaim.findFirst({
      where: {
        venueId,
        email: dto.email.trim().toLowerCase(),
        status: { in: ['RECEIVED', 'INVITE_SENT'] },
      },
    });
    if (open) {
      throw new BadRequestException(
        'Já existe uma solicitação em análise para este e-mail.',
      );
    }
    const protocol = `VR-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const claim = await this.prisma.venueClaim.create({
      data: {
        venueId,
        protocol,
        requesterName: dto.requesterName.trim(),
        requesterRole: dto.requesterRole.trim(),
        email: dto.email.trim().toLowerCase(),
        whatsapp: dto.whatsapp.trim(),
        status: VenueClaimStatus.RECEIVED,
      },
    });

    void notifyTeamNewVenueClaim({
      protocol: claim.protocol,
      venueName: venue.name,
      requesterName: claim.requesterName,
      email: claim.email,
      whatsapp: claim.whatsapp,
      adminClaimsUrl: this.adminClaimsUrl(),
    }).catch((err) => {
      this.logger.warn(`notifyTeamNewVenueClaim: ${String(err)}`);
    });
    void sendVenueClaimRequesterAck({
      to: claim.email,
      requesterName: claim.requesterName,
      venueName: venue.name,
      protocol: claim.protocol,
    }).catch((err) => {
      this.logger.warn(`sendVenueClaimRequesterAck: ${String(err)}`);
    });

    return {
      protocol: claim.protocol,
      status: claim.status,
      message: 'Solicitação recebida. A equipe After entrará em contato.',
    };
  }

  async listForAdmin(status?: string) {
    const normalized = status?.trim().toUpperCase();
    return this.prisma.venueClaim.findMany({
      where:
        normalized && normalized !== 'ALL'
          ? { status: normalized as VenueClaimStatus }
          : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        venue: { select: { id: true, name: true, city: true, state: true } },
      },
    });
  }

  async reject(claimId: string, adminUserId: string) {
    return this.prisma.venueClaim.update({
      where: { id: claimId },
      data: {
        status: VenueClaimStatus.REJECTED,
        reviewerAdminId: adminUserId,
        reviewedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
  }

  async approveInvite(
    claimId: string,
    adminUserId: string,
    dto: ApproveVenueClaimDto,
  ) {
    const claim = await this.prisma.venueClaim.findUnique({
      where: { id: claimId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            profileKind: true,
            standardProfileStatus: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!claim) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (
      claim.status !== VenueClaimStatus.RECEIVED &&
      claim.status !== VenueClaimStatus.INVITE_SENT &&
      claim.status !== VenueClaimStatus.INVITE_EXPIRED
    ) {
      throw new BadRequestException('Este pedido não pode receber convite.');
    }
    if (
      !claim.venue ||
      claim.venue.profileKind !== VenueProfileKind.STANDARD ||
      !isPublishedStandardVenue(claim.venue)
    ) {
      throw new BadRequestException('O perfil padrão não está publicado.');
    }

    const approvedEmail = (dto.approvedEmail?.trim() || claim.email).toLowerCase();
    const token = generateVenueClaimInviteToken();
    const tokenHash = hashVenueClaimInviteToken(token);
    const expiresAt = new Date(Date.now() + VENUE_CLAIM_INVITE_TTL_MS);
    const inviteUrl = buildVenueClaimAcceptUrl(this.webPublicBase(), token);

    await this.prisma.venueClaim.update({
      where: { id: claimId },
      data: {
        status: VenueClaimStatus.INVITE_SENT,
        reviewerAdminId: adminUserId,
        reviewedAt: new Date(),
        approvedEmail,
        inviteTokenHash: tokenHash,
        inviteExpiresAt: expiresAt,
        emailConfirmCodeHash: null,
        emailConfirmCodeExpiresAt: null,
        emailConfirmAttempts: 0,
        emailVerifiedAt: null,
      },
    });

    let emailSent = false;
    if (dto.sendEmail !== false) {
      emailSent = await sendVenueClaimInviteEmail({
        to: approvedEmail,
        venueName: claim.venue.name,
        inviteUrl,
        expiresAt,
      });
    }

    return {
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
      approvedEmail,
      emailSent,
      message: 'Convite gerado. O convite anterior, se existia, foi substituído.',
    };
  }

  async revokeInvite(claimId: string, adminUserId: string) {
    const claim = await this.prisma.venueClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (claim.status !== VenueClaimStatus.INVITE_SENT) {
      throw new BadRequestException('Não há convite ativo para revogar.');
    }
    return this.prisma.venueClaim.update({
      where: { id: claimId },
      data: {
        status: VenueClaimStatus.INVITE_EXPIRED,
        reviewerAdminId: adminUserId,
        reviewedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });
  }

  private async claimByInviteToken(token: string) {
    const tokenHash = hashVenueClaimInviteToken(token.trim());
    const claim = await this.prisma.venueClaim.findFirst({
      where: { inviteTokenHash: tokenHash },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            profileKind: true,
            standardProfileStatus: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!claim || claim.status !== VenueClaimStatus.INVITE_SENT) {
      throw new BadRequestException('Convite inválido ou já utilizado.');
    }
    if (!claim.inviteExpiresAt || claim.inviteExpiresAt.getTime() < Date.now()) {
      await this.prisma.venueClaim.update({
        where: { id: claim.id },
        data: {
          status: VenueClaimStatus.INVITE_EXPIRED,
          inviteTokenHash: null,
        },
      });
      throw new BadRequestException('Convite expirado. Solicite um novo à equipe After.');
    }
    return claim;
  }

  async previewInvite(token: string) {
    const claim = await this.claimByInviteToken(token);
    const email = claim.approvedEmail ?? claim.email;
    const masked = email.replace(/(^.).*(@.*$)/, '$1***$2');
    return {
      venueId: claim.venueId,
      venueName: claim.venue?.name ?? '',
      city: claim.venue?.city,
      state: claim.venue?.state,
      approvedEmailMasked: masked,
      expiresAt: claim.inviteExpiresAt?.toISOString() ?? null,
    };
  }

  async sendInviteEmailCode(token: string) {
    const claim = await this.claimByInviteToken(token);
    const to = claim.approvedEmail ?? claim.email;
    const code = generateVenueClaimEmailCode();
    const codeHash = hashVenueClaimEmailCode(code);
    const expiresAt = new Date(Date.now() + VENUE_CLAIM_EMAIL_CODE_TTL_MS);

    await this.prisma.venueClaim.update({
      where: { id: claim.id },
      data: {
        emailConfirmCodeHash: codeHash,
        emailConfirmCodeExpiresAt: expiresAt,
        emailConfirmAttempts: 0,
        emailVerifiedAt: null,
      },
    });

    const sent = await sendVenueClaimEmailConfirmCode({
      to,
      venueName: claim.venue?.name ?? 'seu local',
      code,
    });
    if (!sent) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.',
      );
    }
    return {
      message: 'Código enviado para o e-mail aprovado.',
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async verifyEmailCode(
    claimId: string,
    claim: {
      emailConfirmCodeHash: string | null;
      emailConfirmCodeExpiresAt: Date | null;
      emailConfirmAttempts: number;
    },
    code: string,
  ) {
    if (!claim.emailConfirmCodeHash || !claim.emailConfirmCodeExpiresAt) {
      throw new BadRequestException('Solicite o código de confirmação antes de concluir.');
    }
    if (claim.emailConfirmCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Código expirado. Solicite um novo código.');
    }
    if (claim.emailConfirmAttempts >= VENUE_CLAIM_EMAIL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException('Muitas tentativas. Solicite um novo código.');
    }
    const ok = hashVenueClaimEmailCode(code.trim()) === claim.emailConfirmCodeHash;
    if (!ok) {
      await this.prisma.venueClaim.update({
        where: { id: claimId },
        data: { emailConfirmAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Código incorreto.');
    }
  }

  async completeInviteAccept(
    token: string,
    code: string,
    userId: string,
  ) {
    const claim = await this.claimByInviteToken(token);
    const approvedEmail = (claim.approvedEmail ?? claim.email).toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, systemAccount: true },
    });
    if (!user || user.systemAccount) {
      throw new ForbiddenException('Conta não elegível.');
    }
    if (user.role !== Role.VENUE) {
      throw new ForbiddenException(
        'Entre com uma conta de estabelecimento cujo e-mail corresponde ao aprovado.',
      );
    }
    if (user.email.trim().toLowerCase() !== approvedEmail) {
      throw new ForbiddenException('O e-mail da sessão não confere com o convite.');
    }

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.venueClaim.findUnique({ where: { id: claim.id } });
      if (!fresh || fresh.status !== VenueClaimStatus.INVITE_SENT) {
        throw new BadRequestException('Convite não está mais disponível.');
      }
      await this.verifyEmailCode(fresh.id, fresh, code);
      const venue = await tx.venue.findUnique({
        where: { id: fresh.venueId },
        select: {
          id: true,
          ownerUserId: true,
          profileKind: true,
          standardProfileStatus: true,
        },
      });
      if (
        !venue ||
        venue.profileKind !== VenueProfileKind.STANDARD ||
        venue.ownerUserId !== AFTER_STANDARD_OWNER_USER_ID
      ) {
        throw new BadRequestException('Este local não pode mais ser transferido.');
      }

      await tx.creditWallet.upsert({
        where: { venueId: venue.id },
        create: { venueId: venue.id, balance: 0, vipBalance: 0 },
        update: {},
      });

      await tx.venue.update({
        where: { id: venue.id },
        data: {
          ownerUserId: userId,
          profileKind: VenueProfileKind.COMPLETE,
          standardProfileStatus: null,
          publicacaoAutorizada: false,
        },
      });

      await tx.venueClaim.update({
        where: { id: fresh.id },
        data: {
          status: VenueClaimStatus.COMPLETED,
          completedAt: new Date(),
          emailVerifiedAt: new Date(),
          inviteTokenHash: null,
          emailConfirmCodeHash: null,
        },
      });

      await tx.venueClaim.updateMany({
        where: {
          venueId: venue.id,
          id: { not: fresh.id },
          status: { in: [VenueClaimStatus.RECEIVED, VenueClaimStatus.INVITE_SENT] },
        },
        data: {
          status: VenueClaimStatus.INVITE_EXPIRED,
          inviteTokenHash: null,
        },
      });
    });

    return {
      message: 'Perfil transferido com sucesso.',
      venueId: claim.venueId,
    };
  }

  async completeInviteAcceptWithSignup(
    token: string,
    code: string,
    input: { name: string; password: string },
  ) {
    const claim = await this.claimByInviteToken(token);
    const approvedEmail = (claim.approvedEmail ?? claim.email).toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email: approvedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe conta com este e-mail. Entre na sua conta de estabelecimento e conclua o aceite.',
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const venueId = claim.venueId;

    const userId = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.venueClaim.findUnique({ where: { id: claim.id } });
      if (!fresh || fresh.status !== VenueClaimStatus.INVITE_SENT) {
        throw new BadRequestException('Convite não está mais disponível.');
      }
      await this.verifyEmailCode(fresh.id, fresh, code);

      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email: approvedEmail,
          passwordHash,
          role: Role.VENUE,
          city: claim.venue?.city?.trim() || 'Cidade',
          state: claim.venue?.state?.trim().toUpperCase() || 'SP',
        },
        select: { id: true },
      });

      const venue = await tx.venue.findUnique({
        where: { id: fresh.venueId },
        select: { id: true, ownerUserId: true, profileKind: true },
      });
      if (
        !venue ||
        venue.profileKind !== VenueProfileKind.STANDARD ||
        venue.ownerUserId !== AFTER_STANDARD_OWNER_USER_ID
      ) {
        throw new BadRequestException('Este local não pode mais ser transferido.');
      }

      await tx.creditWallet.upsert({
        where: { venueId: venue.id },
        create: { venueId: venue.id, balance: 0, vipBalance: 0 },
        update: {},
      });

      await tx.venue.update({
        where: { id: venue.id },
        data: {
          ownerUserId: user.id,
          profileKind: VenueProfileKind.COMPLETE,
          standardProfileStatus: null,
          publicacaoAutorizada: false,
        },
      });

      await tx.venueClaim.update({
        where: { id: fresh.id },
        data: {
          status: VenueClaimStatus.COMPLETED,
          completedAt: new Date(),
          emailVerifiedAt: new Date(),
          inviteTokenHash: null,
          emailConfirmCodeHash: null,
        },
      });

      await tx.venueClaim.updateMany({
        where: {
          venueId: venue.id,
          id: { not: fresh.id },
          status: { in: [VenueClaimStatus.RECEIVED, VenueClaimStatus.INVITE_SENT] },
        },
        data: {
          status: VenueClaimStatus.INVITE_EXPIRED,
          inviteTokenHash: null,
        },
      });

      return user.id;
    });

    return {
      message: 'Conta criada e perfil transferido.',
      venueId,
      userId,
    };
  }

}