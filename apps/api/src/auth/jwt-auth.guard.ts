import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../common/decorators/current-user.decorator';

/** Standard session JWT. Rejects short-lived account-recovery tokens. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const resolved = super.handleRequest(
      err,
      user,
      info,
      context,
      status,
    ) as AuthUser;
    if (resolved?.tokenScope === 'recovery') {
      throw new UnauthorizedException();
    }
    return resolved as TUser;
  }
}
