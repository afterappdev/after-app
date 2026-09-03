import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * JWT válido + role ADMIN no payload assinado pela API.
 * Sem token → 401 (JwtAuthGuard). USER/VENUE → 403 (RolesGuard).
 */
export function AdminOnly() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.ADMIN),
  );
}
