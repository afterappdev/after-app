import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { AppleAuthTokensService } from '../auth/apple-auth-tokens.service';
import { UsersService } from './users.service';
import { ServiceUnavailableException } from '@nestjs/common';

const USER_ID = 'user-1';
const R2_AVATAR = 'https://media.app-after.com.br/uploads/avatar.jpg';
const LOCAL_LOGO = 'http://localhost:3000/uploads/logo.jpg';
const LOCAL_COVER = 'http://localhost:3000/uploads/cover.jpg';
const PHOTO = 'https://media.app-after.com.br/uploads/photo.jpg';
const BANNER = 'https://media.app-after.com.br/uploads/banner.jpg';
const GOOGLE = 'https://lh3.googleusercontent.com/a/photo';

function createPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    socialOnboardingToken: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function cleanupMock() {
  return {
    deleteStoredUpload: jest.fn().mockResolvedValue(undefined),
    deleteStoredUploads: jest.fn().mockResolvedValue(undefined),
  };
}

function appleMock() {
  return {
    revokeForAccount: jest.fn().mockResolvedValue(undefined),
  };
}

describe('UsersService media cleanup', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let mediaCleanup: ReturnType<typeof cleanupMock>;
  let appleTokens: ReturnType<typeof appleMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrisma();
    mediaCleanup = cleanupMock();
    appleTokens = appleMock();
    service = new UsersService(
      prisma as never,
      mediaCleanup as unknown as MediaCleanupService,
      appleTokens as unknown as AppleAuthTokensService,
    );
  });

  describe('updateMe', () => {
    it('troca avatar e limpa o antigo após o update', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        avatarUrl: R2_AVATAR,
      });
      prisma.user.update.mockResolvedValue({
        id: USER_ID,
        avatarUrl: 'https://media.app-after.com.br/uploads/new.jpg',
      });

      await service.updateMe(USER_ID, {
        avatarUrl: 'https://media.app-after.com.br/uploads/new.jpg',
      });

      expect(prisma.user.update).toHaveBeenCalled();
      expect(mediaCleanup.deleteStoredUpload).toHaveBeenCalledWith(R2_AVATAR);
    });

    it('avatar externo antigo é enviado ao cleanup (no-op no storage)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        avatarUrl: GOOGLE,
      });
      prisma.user.update.mockResolvedValue({
        id: USER_ID,
        avatarUrl: R2_AVATAR,
      });

      await service.updateMe(USER_ID, { avatarUrl: R2_AVATAR });

      expect(mediaCleanup.deleteStoredUpload).toHaveBeenCalledWith(GOOGLE);
    });

    it('não limpa quando o avatar continua igual', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        avatarUrl: R2_AVATAR,
      });
      prisma.user.update.mockResolvedValue({
        id: USER_ID,
        avatarUrl: R2_AVATAR,
      });

      await service.updateMe(USER_ID, { avatarUrl: R2_AVATAR, name: 'Ana' });

      expect(mediaCleanup.deleteStoredUpload).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    function venueUser() {
      return {
        id: USER_ID,
        email: 'local@after.local',
        role: 'VENUE',
        appleId: null,
        googleId: null,
        appleRefreshTokenEnc: null,
        appleClientId: null,
        avatarUrl: R2_AVATAR,
        venue: {
          logoUrl: LOCAL_LOGO,
          coverUrl: LOCAL_COVER,
          photos: [{ url: PHOTO }],
          banners: [{ imageUrl: BANNER }],
        },
      };
    }

    it('exclui USER permanente após revoke Apple (no-op se não houver token)', async () => {
      const user = {
        id: USER_ID,
        email: 'ana@after.local',
        role: 'USER',
        appleId: null,
        googleId: 'gid-1',
        appleRefreshTokenEnc: null,
        appleClientId: null,
        avatarUrl: R2_AVATAR,
        venue: null,
      };
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await service.deleteAccount(USER_ID);

      expect(appleTokens.revokeForAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: USER_ID, role: 'USER' }),
      );
      expect(prisma.socialOnboardingToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: 'ana@after.local' },
            { provider: 'google', providerId: 'gid-1' },
          ],
        },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
      expect(mediaCleanup.deleteStoredUploads).toHaveBeenCalledWith([R2_AVATAR]);
    });

    it('exclui VENUE e mídias; onboarding e user somem antes do cleanup', async () => {
      const order: string[] = [];
      prisma.user.findUnique.mockResolvedValue(venueUser());
      prisma.socialOnboardingToken.deleteMany.mockImplementation(async () => {
        order.push('onboarding');
        return { count: 1 };
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('db');
        return { id: USER_ID };
      });
      mediaCleanup.deleteStoredUploads.mockImplementation(async () => {
        order.push('cleanup');
      });

      await service.deleteAccount(USER_ID);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
      expect(mediaCleanup.deleteStoredUploads).toHaveBeenCalledWith([
        R2_AVATAR,
        LOCAL_LOGO,
        LOCAL_COVER,
        PHOTO,
        BANNER,
      ]);
      expect(order).toEqual(['onboarding', 'db', 'cleanup']);
    });

    it('Apple user com token revogável chama revoke antes de apagar', async () => {
      const order: string[] = [];
      appleTokens.revokeForAccount.mockImplementation(async () => {
        order.push('revoke');
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'hidden@privaterelay.appleid.com',
        role: 'USER',
        appleId: 'apple-sub-1',
        googleId: null,
        appleRefreshTokenEnc: 'v1.iv.tag.cipher',
        appleClientId: 'com.r2p.after.afterApp',
        avatarUrl: null,
        venue: null,
      });
      prisma.user.delete.mockImplementation(async () => {
        order.push('db');
        return { id: USER_ID };
      });

      await service.deleteAccount(USER_ID);

      expect(appleTokens.revokeForAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          appleId: 'apple-sub-1',
          appleRefreshTokenEnc: 'v1.iv.tag.cipher',
        }),
      );
      expect(prisma.socialOnboardingToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: 'hidden@privaterelay.appleid.com' },
            { provider: 'apple', providerId: 'apple-sub-1' },
          ],
        },
      });
      expect(order).toEqual(['revoke', 'db']);
    });

    it('Apple user antigo sem token ainda exclui a conta', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'hidden@privaterelay.appleid.com',
        role: 'USER',
        appleId: 'apple-sub-old',
        googleId: null,
        appleRefreshTokenEnc: null,
        appleClientId: null,
        avatarUrl: null,
        venue: null,
      });
      prisma.user.delete.mockResolvedValue({ id: USER_ID });

      await service.deleteAccount(USER_ID);

      expect(appleTokens.revokeForAccount).toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalled();
    });

    it('falha da Apple durante revoke não apaga a conta', async () => {
      appleTokens.revokeForAccount.mockRejectedValue(
        new ServiceUnavailableException(
          'Não foi possível concluir a exclusão agora. Tente novamente em instantes.',
        ),
      );
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: 'USER',
        appleId: 'apple-sub-1',
        appleRefreshTokenEnc: 'v1.iv.tag.cipher',
        appleClientId: 'com.r2p.after.afterApp',
      });

      await expect(service.deleteAccount(USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.socialOnboardingToken.deleteMany).not.toHaveBeenCalled();
      expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
    });

    it('deleteUserRecord recusa ADMIN sem apagar', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: 'ADMIN',
        avatarUrl: null,
        venue: null,
      });

      await expect(service.deleteAccount(USER_ID)).rejects.toThrow(
        'Conta administrativa não pode ser excluída por este fluxo.',
      );
      expect(appleTokens.revokeForAccount).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
    });
  });
});
