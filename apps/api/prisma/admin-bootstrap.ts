import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export const ADMIN_MIN_PASSWORD_LENGTH = 6;

export type AdminBootstrapResult =
  | { status: 'ok'; email: string }
  | { status: 'missing-credentials' }
  | { status: 'weak-password' }
  | { status: 'email-taken'; email: string; role: Role };

export async function upsertAdminFromEnv(
  prisma: PrismaClient,
): Promise<AdminBootstrapResult> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    return { status: 'missing-credentials' };
  }
  if (password.length < ADMIN_MIN_PASSWORD_LENGTH) {
    return { status: 'weak-password' };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existing && existing.role !== Role.ADMIN) {
    return { status: 'email-taken', email, role: existing.role };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: {
      role: Role.ADMIN,
      passwordHash,
    },
    create: {
      name: 'After Admin',
      email,
      passwordHash,
      role: Role.ADMIN,
      state: 'SP',
      city: 'São Paulo',
    },
  });

  return { status: 'ok', email };
}
