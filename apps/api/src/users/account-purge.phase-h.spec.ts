import { ConflictException } from '@nestjs/common';
import { AccountLifecycleStatus } from '@prisma/client';
import { AccountPurgeAuditService } from './account-purge.audit';
import {
  AccountPermanentPurgeExecutorImpl,
  PurgeLeaseLostError,
} from './account-purge.executor.impl';
import { UploadPurgeIncompleteError } from './account-purge.upload';
import { UsersService } from './users.service';
import { isVenuePubliclyVisible } from '../common/moderation/audience';
import { MediaCleanupService } from '../uploads/media-cleanup.service';
import { AppleAuthTokensService } from '../auth/apple-auth-tokens.service';
import { AccountLifecycleService } from './account-lifecycle.service';

describe('account-purge phase H', () => {
  describe('executor uploads and lease', () => {
    const store = {
      loadProcessingJob: jest.fn(),
      saveProgress: jest.fn(),
      assertLeaseHeld: jest.fn().mockResolvedValue(true),
    };
    const users = {
      listFinancialPurgeBlockersForUser: jest.fn().mockResolvedValue([]),
      anonymizeFinancialRetention: jest.fn(),
      loadUserForPermanentPurge: jest.fn(),
      collectUploadUrlsFromUser: jest.fn().mockReturnValue(['https://media/x.jpg']),
      revokeOAuthBeforePermanentRemoval: jest.fn(),
      finalizePermanentUserRemoval: jest.fn().mockResolvedValue('hard_deleted'),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'USER',
          accountStatus: AccountLifecycleStatus.PENDING_DELETION,
          permanentDeletionAt: new Date('2020-01-01'),
        }),
      },
    };
    const mediaCleanup = {
      deleteStoredUploadsWithReport: jest.fn(),
    };
    const purgeAudit = { log: jest.fn() };
    const ctx = {
      jobId: 'job-1',
      workerId: 'w1',
      leaseEpoch: 2,
      renewLease: jest.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      store.loadProcessingJob.mockResolvedValue({
        id: 'job-1',
        userId: 'u1',
        progressStage: 'DATA',
        uploadManifest: ['https://media/x.jpg'],
      });
    });

    it('falha UPLOADS quando R2 retorna erro parcial', async () => {
      mediaCleanup.deleteStoredUploadsWithReport.mockResolvedValue({
        attempted: 1,
        removed: 0,
        failedUrls: ['https://media/x.jpg'],
      });
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users as never,
        mediaCleanup as never,
        store as never,
        purgeAudit as never,
      );
      await expect(
        executor.executePermanentPurge('u1', ctx),
      ).rejects.toBeInstanceOf(UploadPurgeIncompleteError);
    });

    it('lease perdido na renovação antes de uploads', async () => {
      ctx.renewLease.mockResolvedValueOnce(false);
      mediaCleanup.deleteStoredUploadsWithReport.mockResolvedValue({
        attempted: 0,
        removed: 0,
        failedUrls: [],
      });
      const executor = new AccountPermanentPurgeExecutorImpl(
        prisma as never,
        users as never,
        mediaCleanup as never,
        store as never,
        purgeAudit as never,
      );
      await expect(
        executor.executePermanentPurge('u1', ctx),
      ).rejects.toBeInstanceOf(PurgeLeaseLostError);
    });
  });

  describe('admin purge blockers', () => {
    function buildUsersService(prisma: Record<string, unknown>) {
      return new UsersService(
        prisma as never,
        {
          deleteStoredUploadsWithReport: jest.fn().mockResolvedValue({
            attempted: 0,
            removed: 0,
            failedUrls: [],
          }),
        } as unknown as MediaCleanupService,
        { revokeForAccount: jest.fn() } as unknown as AppleAuthTokensService,
        {} as AccountLifecycleService,
        new AccountPurgeAuditService(),
      );
    }

    it('admin hard recusa com blockers financeiros', async () => {
      const prisma = {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'u1',
              role: 'VENUE',
              appleId: null,
              appleRefreshTokenEnc: null,
              appleClientId: null,
            })
            .mockResolvedValueOnce({
              id: 'u1',
              role: 'VENUE',
              avatarUrl: null,
              ownedVenues: [],
            }),
        },
        venue: { findMany: jest.fn().mockResolvedValue([{ id: 'v1' }]) },
        creditObligation: { count: jest.fn().mockResolvedValue(1) },
        creditPurchase: { count: jest.fn().mockResolvedValue(0) },
        creditRefundAudit: { count: jest.fn().mockResolvedValue(0) },
        creditLedgerEntry: { count: jest.fn().mockResolvedValue(0) },
      };
      prisma.creditPurchase = {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      prisma.vipCreditEntry = { count: jest.fn().mockResolvedValue(0) };
      const service = buildUsersService(prisma);
      await expect(
        service.purgeAccountPermanently('u1', { strategy: 'hard' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('PURGED visibility', () => {
    it('conta PURGED não é publicamente visível', () => {
      expect(
        isVenuePubliclyVisible({
          owner: { accountStatus: AccountLifecycleStatus.PURGED },
        }),
      ).toBe(false);
    });
  });
});
