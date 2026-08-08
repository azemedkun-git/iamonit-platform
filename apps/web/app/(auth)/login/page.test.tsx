import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const { login, establishAuthSession, replace } = vi.hoisted(() => ({
  login: vi.fn(), establishAuthSession: vi.fn(), replace: vi.fn(),
}));
vi.mock('../../../lib/api', () => ({ login }));
vi.mock('../../../lib/auth', () => ({ establishAuthSession }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const response = {
  session: { accessToken: 'a', refreshToken: 'r', expiresIn: 1, expiresAt: 2, tokenType: 'bearer' },
  requiresEmailConfirmation: false,
  user: { id: 'u', email: 'admin@example.test', tenantId: 't', role: 'admin', fullName: 'Admin User', phone: '555-0100' },
};

async function submitValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), 'admin@example.test');
  await user.type(screen.getByLabelText('Password'), 'password1');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    login.mockReset(); establishAuthSession.mockReset(); replace.mockReset();
    login.mockResolvedValue(response); establishAuthSession.mockResolvedValue(undefined);
  });

  it('submits only email and password, installs the session, and redirects', async () => {
    render(<LoginPage />); await submitValidForm();
    expect(login).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'password1' });
    expect(establishAuthSession).toHaveBeenCalledWith(response);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('validates fields before requesting login', async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeVisible();
    expect(login).not.toHaveBeenCalled();
  });

  it('prevents duplicate submission while loading and displays safe failures', async () => {
    let reject!: (error: Error) => void;
    login.mockReturnValue(new Promise((_resolve, nextReject) => { reject = nextReject; }));
    render(<LoginPage />); await submitValidForm();
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Signing in…' }));
    expect(login).toHaveBeenCalledOnce();
    reject(new Error('Invalid email or password.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('rejects a null session without redirecting', async () => {
    login.mockResolvedValue({ ...response, session: null });
    render(<LoginPage />); await submitValidForm();
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication could not be completed.');
    expect(establishAuthSession).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });
});
