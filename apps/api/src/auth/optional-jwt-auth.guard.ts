import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Public endpoints that optionally personalize for a logged-in USER
 * (e.g. hide blocked venues).
 *
 * - No Authorization header → anonymous access.
 * - Valid Bearer → request.user is set.
 * - Bearer present but invalid, expired or malformed → 401.
 *   Invalid tokens must not fall through as anonymous.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const header = request.headers?.authorization;
    if (header == null || header.trim() === '') {
      return true;
    }
    return super.canActivate(context);
  }
}
