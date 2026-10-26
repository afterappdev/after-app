import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Session or account-recovery JWT (read-only deletion status). */
@Injectable()
export class DeletionScopeAuthGuard extends AuthGuard('jwt') {}
