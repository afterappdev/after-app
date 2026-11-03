import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ACTIVE_VENUE_HEADER } from '../../venues/venue-auth-payload';

export const ActiveVenueId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = request.headers[ACTIVE_VENUE_HEADER];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (Array.isArray(raw) && raw[0]?.trim()) {
      return raw[0].trim();
    }
    return undefined;
  },
);
