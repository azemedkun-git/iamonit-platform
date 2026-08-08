'use client';

import type { AuthResponse, AuthUserContext } from './auth.types';
import { getBrowserSupabaseClient } from './supabase';

const SESSION_ERROR = 'Authentication could not be completed. Please try again.';

let currentUser: AuthUserContext | null = null;

export function getCurrentAuthUser(): AuthUserContext | null {
  return currentUser;
}

export function clearCurrentAuthUser(): void {
  currentUser = null;
}

export async function establishAuthSession(
  response: AuthResponse,
): Promise<void> {
  clearCurrentAuthUser();
  if (!response.session) {
    throw new Error(SESSION_ERROR);
  }

  try {
    const { error } = await getBrowserSupabaseClient().auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error) {
      throw error;
    }
    currentUser = response.user;
  } catch {
    clearCurrentAuthUser();
    throw new Error(SESSION_ERROR);
  }
}
