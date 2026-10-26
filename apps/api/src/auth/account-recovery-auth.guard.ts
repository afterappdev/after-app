import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser } from '../common/decorators/current-user.decorator';

/** Only accepts account-recovery JWTs (cancel/status while pending deletion). */
@Injectable()
export class AccountRecoveryAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    const resolved = super.handleRequest(
      err,
      user,
      _info,
      _context,
      _status,
    ) as AuthUser;
    if (resolved?.tokenScope !== 'recovery') {
      throw new UnauthorizedException();
    }
    return resolved as TUser;
  }
}
