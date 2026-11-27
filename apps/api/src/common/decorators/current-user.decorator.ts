import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthTokenScope = 'session' | 'recovery';

export class AuthUser {
  userId!: string;
  email!: string;
  role!: 'USER' | 'VENUE' | 'ADMIN';
  tokenScope?: AuthTokenScope;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext,
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    return data != null ? user[data] : user;
  },
);
