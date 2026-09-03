import { PrismaClient } from '@prisma/client';
import {
  ADMIN_MIN_PASSWORD_LENGTH,
  upsertAdminFromEnv,
} from './admin-bootstrap';

const prisma = new PrismaClient();

async function main() {
  const result = await upsertAdminFromEnv(prisma);

  if (result.status === 'missing-credentials') {
    throw new Error(
      'Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de rodar este script.',
    );
  }
  if (result.status === 'weak-password') {
    throw new Error(
      `ADMIN_PASSWORD deve ter no mínimo ${ADMIN_MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
  if (result.status === 'email-taken') {
    throw new Error(
      `${result.email} já pertence a uma conta ${result.role}. Use outro e-mail.`,
    );
  }

  console.log(`Conta ADMIN pronta para ${result.email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
