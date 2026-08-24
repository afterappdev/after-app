import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
        venue: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }

  async updateMe(
    userId: string,
    data: { name?: string; city?: string; state?: string; avatarUrl?: string | null },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        city: data.city,
        state: data.state,
        avatarUrl:
          data.avatarUrl === undefined ? undefined : data.avatarUrl || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        state: true,
        city: true,
        avatarUrl: true,
      },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new BadRequestException('Senha atual incorreta.');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException(
        'A senha deverá conter no mínimo 6 caracteres.',
      );
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    return { ok: true };
  }
}
