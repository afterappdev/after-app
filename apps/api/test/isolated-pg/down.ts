import { spawn } from 'child_process';
import { resolve } from 'path';

/**
 * Future container stop. Refuses unless AFTER_ISOLATED_PG_START=authorized.
 * Does not read DATABASE_URL and does not touch the `after` database.
 */
function main(): void {
  if (process.env.AFTER_ISOLATED_PG_START !== 'authorized') {
    console.error('encerramento recusado: container isolado não autorizado');
    process.exit(2);
  }
  const compose = resolve(__dirname, 'docker-compose.credit-ledger.yml');
  const child = spawn(
    'docker',
    ['compose', '-p', 'after-credit-ledger-test', '-f', compose, 'down', '-v'],
    { stdio: 'inherit', shell: false },
  );
  child.on('exit', (code) => process.exit(code ?? 1));
}

main();
