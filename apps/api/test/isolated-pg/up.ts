import { spawn } from 'child_process';
import { resolve } from 'path';
import {
  assertIsolatedPgTarget,
  isolatedPgTargetFromDedicatedEnv,
} from '../../src/credits/isolated-pg-guard';

/**
 * Future container start. Refuses unless a later phase sets
 * AFTER_ISOLATED_PG_START=authorized. This phase must not run the script.
 */
function main(): void {
  if (process.env.AFTER_ISOLATED_PG_START !== 'authorized') {
    console.error('inicialização recusada: container isolado não autorizado');
    process.exit(2);
  }
  assertIsolatedPgTarget(isolatedPgTargetFromDedicatedEnv(process.env));
  const compose = resolve(__dirname, 'docker-compose.credit-ledger.yml');
  const child = spawn(
    'docker',
    ['compose', '-p', 'after-credit-ledger-test', '-f', compose, 'up', '-d'],
    { stdio: 'inherit', shell: false },
  );
  child.on('exit', (code) => process.exit(code ?? 1));
}

main();
