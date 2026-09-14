import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { UsersService } from './users.service';

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
  };
}

function cleanupMock() {
  return {
    deleteStoredUpload: jest.fn().mockResolvedValue(undefined),
    deleteStoredUploads: jest.fn().mockResolvedValue(undefined),
  };
}

describe('UsersService media cleanup', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let mediaCleanup: ReturnType<typeof cleanupMock>;
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrisma();
    mediaCleanup = cleanupMock();
    service = new UsersService(
      prisma as never,
      mediaCleanup as unknown as MediaCleanupService,
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
    it('exclui o banco e depois chama cleanup com todas as mídias', async () => {
      const order: string[] = [];
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        role: 'VENUE',
        avatarUrl: R2_AVATAR,
        venue: {
          logoUrl: LOCAL_LOGO,
          coverUrl: LOCAL_COVER,
          photos: [{ url: PHOTO }],
          banners: [{ imageUrl: BANNER }],
        },
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
      expect(order).toEqual(['db', 'cleanup']);
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
      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(mediaCleanup.deleteStoredUploads).not.toHaveBeenCalled();
    });
  });
});
