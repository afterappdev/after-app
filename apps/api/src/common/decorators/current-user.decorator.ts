import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthTokenScope = 'session' | 'recovery';

export class AuthUser {
  userId!: string;
  email!: string;
  role!: 'USER' | 'VENUE' | 'ADMIN';
  tokenScope?: AuthTokenScope;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
