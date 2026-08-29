import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RegisterPage from './page';
const registerTransporter = vi.fn(); const registerCarPuller = vi.fn();
vi.mock('../../../lib/api', () => ({ registerTransporter, registerCarPuller }));

describe('RegisterPage', () => {
  it('offers both account types without making an auth request', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('link', { name: 'Sign Up as a Transporter' })).toHaveAttribute('href', '/register/transporter');
    expect(screen.getByRole('link', { name: 'Sign Up as a Car Puller' })).toHaveAttribute('href', '/register/car-puller');
    expect(registerTransporter).not.toHaveBeenCalled(); expect(registerCarPuller).not.toHaveBeenCalled();
  });
});
