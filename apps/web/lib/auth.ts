'use client';

import type { MembershipSummary, MultiTenantAuthResponse, UserProfile } from './auth.types';
import { getBrowserSupabaseClient } from './supabase';

const SESSION_ERROR = 'Authentication could not be completed. Please try again.';

export interface AuthState {
  profile: UserProfile;
  memberships: MembershipSummary[];
  selectedMembership: MembershipSummary | null;
}

let currentAuthState: AuthState | null = null;

export function getCurrentAuthState(): AuthState | null { return currentAuthState; }
export function clearCurrentAuthState(): void { currentAuthState = null; }

export async function establishAuthSession(response: MultiTenantAuthResponse): Promise<void> {
  clearCurrentAuthState();
  if (!response.session) throw new Error(SESSION_ERROR);
  try {
    const { error } = await getBrowserSupabaseClient().auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error) throw error;
    currentAuthState = {
      profile: response.profile,
      memberships: response.memberships,
      selectedMembership: response.selectedMembership,
    };
  } catch {
    clearCurrentAuthState();
    throw new Error(SESSION_ERROR);
  }
}

export function selectMembership(membership: MembershipSummary): boolean {
  if (!currentAuthState) return false;
  const returnedMembership = currentAuthState.memberships.find((item) => item === membership);
  if (!returnedMembership) return false;
  currentAuthState = { ...currentAuthState, selectedMembership: returnedMembership };
  return true;
}
