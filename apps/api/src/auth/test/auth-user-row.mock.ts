import { AccountLifecycleStatus, Role } from '@prisma/client';
import type { AuthUserVenueRow } from '../../venues/venue-auth-payload';

type AuthUserRow = AuthUserVenueRow & {
  id: string;
  name: string;
  email: string;
  role: Role;
  state: string;
  city: string;
  avatarUrl: string | null;
  sessionVersion: number;
  accountStatus?: AccountLifecycleStatus;
};

export function authUserRow(
  partial: Partial<AuthUserRow> & Pick<AuthUserRow, 'id' | 'email' | 'role'>,
): AuthUserRow {
  return {
    name: 'User',
    state: 'SP',
    city: 'São Paulo',
    avatarUrl: null,
    sessionVersion: 1,
    accountStatus: AccountLifecycleStatus.ACTIVE,
    activeVenueId: null,
    ownedVenues: [],
    ...partial,
  };
}

export function ownedVenueSummary(
  id: string,
  name = 'Bar',
): AuthUserVenueRow['ownedVenues'][number] {
  return {
    id,
    name,
    city: 'São Paulo',
    state: 'SP',
    logoUrl: null,
  };
}
