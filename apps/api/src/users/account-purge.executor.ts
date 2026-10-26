export type PermanentPurgeRunContext = {
  jobId: string;
  workerId: string;
  leaseEpoch: number;
  renewLease: () => Promise<boolean>;
};

export interface AccountPermanentPurgeExecutor {
  executePermanentPurge(
    userId: string,
    ctx: PermanentPurgeRunContext,
  ): Promise<void>;
}

export const ACCOUNT_PURGE_EXECUTOR = Symbol('ACCOUNT_PURGE_EXECUTOR');
