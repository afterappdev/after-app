import { Logger } from '@nestjs/common';
import { CardRefundReconcileScheduler } from './card-refund-reconcile.scheduler';
import { CARD_PAID_RECONCILE_INTERVAL_MS } from './card-refund.ledger';
import { CardReconcileRun, CreditsService } from './credits.service';
import { PrismaService } from '../prisma/prisma.service';

const quiet: CardReconcileRun = {
  skipped: false,
  skipReason: null,
  checked: 2,
  refunded: 1,
  partial: 0,
  errors: 0,
  timeouts: 0,
  rateLimited: 0,
  leaseLost: false,
};

function columns(names: string[]) {
  return {
    $queryRaw: jest.fn(async () => names.map((column_name) => ({ column_name }))),
  };
}

function schedulerFor(
  reconcile: jest.Mock,
  names = ['cursorConfirmedAt', 'cursorPurchaseId', 'cooldownUntil'],
) {
  const credits = {
    reconcilePaidCardPurchases: reconcile,
    createCharge: jest.fn(),
  };
  const task = new CardRefundReconcileScheduler(
    credits as unknown as CreditsService,
    columns(names) as unknown as PrismaService,
  );
  return { task, credits };
}

describe('CardRefundReconcileScheduler', () => {
  const originalFlag = process.env.CARD_REFUND_RECONCILE_ENABLED;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.CARD_REFUND_RECONCILE_ENABLED;
    else process.env.CARD_REFUND_RECONCILE_ENABLED = originalFlag;
    process.env.NODE_ENV = originalEnv;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(['development', 'test', 'production'])(
    'fica desligado em %s sem a flag true',
    async (nodeEnv) => {
      process.env.NODE_ENV = nodeEnv;
      delete process.env.CARD_REFUND_RECONCILE_ENABLED;
      const reconcile = jest.fn();
      const { task } = schedulerFor(reconcile);
      task.onModuleInit();
      await task.tick();
      process.env.CARD_REFUND_RECONCILE_ENABLED = 'false';
      await task.tick();
      process.env.CARD_REFUND_RECONCILE_ENABLED = 'TRUE';
      await task.tick();
      expect(reconcile).not.toHaveBeenCalled();
      task.onModuleDestroy();
    },
  );

  it('não dispara no startup e roda a cada 15 minutos quando a flag é true', async () => {
    expect(CARD_PAID_RECONCILE_INTERVAL_MS).toBe(15 * 60 * 1000);
    jest.useFakeTimers();
    process.env.CARD_REFUND_RECONCILE_ENABLED = 'true';
    const reconcile = jest.fn(async () => quiet);
    const { task, credits } = schedulerFor(reconcile);
    task.onModuleInit();
    await Promise.resolve();
    expect(reconcile).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(CARD_PAID_RECONCILE_INTERVAL_MS - 1);
    expect(reconcile).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(credits.createCharge).not.toHaveBeenCalled();
    task.onModuleDestroy();
  });

  it('avisa e não consulta pedidos quando as colunas ainda não existem', async () => {
    process.env.CARD_REFUND_RECONCILE_ENABLED = 'true';
    const reconcile = jest.fn();
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { task } = schedulerFor(reconcile, ['lockedUntil']);
    await task.tick();
    expect(reconcile).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('skipped schema');
  });

  it('duas instâncias chamam a reconciliação e a sobreposição local não duplica', async () => {
    process.env.CARD_REFUND_RECONCILE_ENABLED = 'true';
    const reconcile = jest.fn(async () => ({
      ...quiet,
      skipped: true,
      skipReason: 'lock' as const,
    }));
    const first = schedulerFor(reconcile).task;
    const second = schedulerFor(reconcile).task;
    await Promise.all([first.tick(), second.tick()]);
    expect(reconcile).toHaveBeenCalledTimes(2);

    let release: (value: CardReconcileRun) => void = () => undefined;
    let entered: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hanging = jest.fn(
      () =>
        new Promise<CardReconcileRun>((resolve) => {
          entered();
          release = resolve;
        }),
    );
    const logged = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { task } = schedulerFor(hanging);
    const running = task.tick();
    await waiting;
    await task.tick();
    expect(hanging).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls.flat().join(' ')).toContain('skipped overlap');
    release(quiet);
    await running;
  });

  it('um erro inesperado não impede a execução seguinte e não vaza segredo', async () => {
    process.env.CARD_REFUND_RECONCILE_ENABLED = 'true';
    const reconcile = jest
      .fn()
      .mockRejectedValueOnce(new Error('APP_USR-secret Bearer abc'))
      .mockResolvedValueOnce(quiet);
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { task } = schedulerFor(reconcile);
    await task.tick();
    await task.tick();
    expect(reconcile).toHaveBeenCalledTimes(2);
    const text = logged.mock.calls.flat().join(' ');
    expect(text).toContain('failed');
    expect(text).not.toContain('APP_USR-secret');
    expect(text).not.toContain('Bearer abc');
  });

  it('o reinício da aplicação não executa a rotina na hora', async () => {
    jest.useFakeTimers();
    process.env.CARD_REFUND_RECONCILE_ENABLED = 'true';
    const reconcile = jest.fn(async () => quiet);
    const first = schedulerFor(reconcile).task;
    first.onModuleInit();
    first.onModuleDestroy();
    const restarted = schedulerFor(reconcile).task;
    restarted.onModuleInit();
    await Promise.resolve();
    expect(reconcile).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(CARD_PAID_RECONCILE_INTERVAL_MS);
    expect(reconcile).toHaveBeenCalledTimes(1);
    restarted.onModuleDestroy();
  });
});
