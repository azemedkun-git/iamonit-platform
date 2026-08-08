import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './page';

const { register, establishAuthSession, clearCurrentAuthUser, replace } = vi.hoisted(() => ({
  register: vi.fn(), establishAuthSession: vi.fn(), clearCurrentAuthUser: vi.fn(), replace: vi.fn(),
}));
vi.mock('../../../lib/api', () => ({ register }));
vi.mock('../../../lib/auth', () => ({ establishAuthSession, clearCurrentAuthUser }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const response = {
  session: { accessToken: 'a', refreshToken: 'r', expiresIn: 1, expiresAt: 2, tokenType: 'bearer' },
  requiresEmailConfirmation: false,
  user: { id: 'u', email: 'admin@example.test', tenantId: 't', role: 'admin', fullName: 'Admin User', phone: '555-0100' },
};

async function submitValidForm(phone = '+14694681177') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Full name'), 'Admin User');
  await user.type(screen.getByLabelText('Company name'), 'Example Co');
  await user.type(screen.getByLabelText('Email address'), 'admin@example.test');
  await user.type(screen.getByLabelText('Phone number'), phone);
  await user.type(screen.getByLabelText('Password'), 'password1');
  await user.type(screen.getByLabelText('Confirm password'), 'password1');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    register.mockReset(); establishAuthSession.mockReset(); clearCurrentAuthUser.mockReset(); replace.mockReset();
    register.mockResolvedValue(response); establishAuthSession.mockResolvedValue(undefined);
  });

  it('removes role and submits the exact approved payload before installing and redirecting', async () => {
    render(<RegisterPage />);
    expect(screen.queryByText('Your role')).not.toBeInTheDocument();
    await submitValidForm();
    expect(register).toHaveBeenCalledWith({ email: 'admin@example.test', password: 'password1', companyName: 'Example Co', fullName: 'Admin User', phone: '+14694681177' });
    expect(register.mock.calls[0][0]).not.toHaveProperty('role');
    expect(register.mock.calls[0][0]).not.toHaveProperty('confirmPassword');
    expect(establishAuthSession).toHaveBeenCalledWith(response); expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows confirmation guidance without establishing a session', async () => {
    register.mockResolvedValue({ ...response, session: null, requiresEmailConfirmation: true });
    render(<RegisterPage />); await submitValidForm();
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email and confirm your account');
    expect(screen.getByRole('link', { name: 'the login page' })).toHaveAttribute('href', '/login');
    expect(clearCurrentAuthUser).toHaveBeenCalled(); expect(establishAuthSession).not.toHaveBeenCalled();
  });

  it('validates matching passwords before requesting registration', async () => {
    render(<RegisterPage />); const user = userEvent.setup();
    await user.type(screen.getByLabelText('Password'), 'password1');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Passwords do not match.')).toBeVisible(); expect(register).not.toHaveBeenCalled();
  });

  it.each([
    '4694681177',
    '14694681177',
    '+1ABC4681177',
    '+',
    '+1234567890123456',
  ])('rejects invalid international phone format %s without registering', async (phone) => {
    render(<RegisterPage />);
    await submitValidForm(phone);

    expect(
      await screen.findByText(
        'Enter a phone number in international format, e.g. +14694681177.',
      ),
    ).toBeVisible();
    expect(register).not.toHaveBeenCalled();
    expect(establishAuthSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions and shows safe session installation failures', async () => {
    establishAuthSession.mockRejectedValue(new Error('Authentication could not be completed. Please try again.'));
    render(<RegisterPage />); await submitValidForm();
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication could not be completed.');
    expect(register).toHaveBeenCalledOnce(); expect(replace).not.toHaveBeenCalled();
  });
});
