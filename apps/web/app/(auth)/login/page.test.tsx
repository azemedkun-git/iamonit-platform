import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';
const mocks = vi.hoisted(() => ({ login: vi.fn(), establish: vi.fn(), select: vi.fn(), replace: vi.fn() }));
vi.mock('../../../lib/api', () => ({ loginMultiTenant: mocks.login }));
vi.mock('../../../lib/auth', () => ({ establishAuthSession: mocks.establish, selectMembership: mocks.select }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
const memberships = [
  { membershipId: 'one', tenantId: 't1', tenantName: 'Alpha Transport', role: 'admin', status: 'active' },
  { membershipId: 'two', tenantId: 't2', tenantName: 'Beta Transport', role: 'dispatcher', status: 'active' },
];
const response = { session: { accessToken: 'a', refreshToken: 'r', expiresIn: 1, expiresAt: 2, tokenType: 'bearer' }, requiresEmailConfirmation: false, profile: { userId: 'u', email: 'person@example.test', fullName: 'Person', phone: '+14694681177' }, memberships: [], selectedMembership: null };
async function submit() { const user = userEvent.setup(); await user.type(screen.getByLabelText('Email address'), 'person@example.test'); await user.type(screen.getByLabelText('Password'), 'password1'); await user.click(screen.getByRole('button', { name: 'Sign in' })); }

describe('LoginPage', () => {
  afterEach(cleanup);
  beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.login.mockResolvedValue(response); mocks.establish.mockResolvedValue(undefined); mocks.select.mockReturnValue(true); });
  it('logs in with the exact payload, installs zero-membership state, and redirects', async () => {
    render(<LoginPage />); await submit();
    expect(mocks.login).toHaveBeenCalledWith({ email: 'person@example.test', password: 'password1' }); expect(mocks.establish).toHaveBeenCalledWith(response); expect(mocks.replace).toHaveBeenCalledWith('/');
  });
  it('retains a backend-selected single membership', async () => {
    const one = { ...response, memberships: [memberships[0]], selectedMembership: memberships[0] }; mocks.login.mockResolvedValue(one);
    render(<LoginPage />); await submit(); expect(mocks.establish).toHaveBeenCalledWith(one); expect(mocks.replace).toHaveBeenCalledWith('/');
  });
  it('shows all returned memberships and does not auto-select', async () => {
    mocks.login.mockResolvedValue({ ...response, memberships }); render(<LoginPage />); await submit();
    expect(await screen.findByRole('heading', { name: 'Choose a company' })).toBeVisible(); expect(screen.getByText('Alpha Transport')).toBeVisible(); expect(screen.getByText('admin')).toBeVisible(); expect(screen.getByText('Beta Transport')).toBeVisible(); expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Beta Transport/ })); expect(mocks.select).toHaveBeenCalledWith(memberships[1]); expect(mocks.replace).toHaveBeenCalledWith('/');
  });
  it('does not redirect when membership selection is rejected', async () => {
    mocks.login.mockResolvedValue({ ...response, memberships }); mocks.select.mockReturnValue(false); render(<LoginPage />); await submit(); await userEvent.click(await screen.findByRole('button', { name: /Alpha Transport/ })); expect(mocks.replace).not.toHaveBeenCalled();
  });
  it('prevents duplicate submission and preserves safe errors', async () => {
    let reject!: (error: Error) => void; mocks.login.mockReturnValue(new Promise((_resolve, nextReject) => { reject = nextReject; })); render(<LoginPage />); await submit();
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled(); expect(mocks.login).toHaveBeenCalledOnce(); reject(new Error('Invalid email or password.')); expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });
});
