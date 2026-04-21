import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { describe, it, expect, vi } from 'vitest'

import { mockCredentials } from '@/testing/auth-fixtures'
import { renderWithProviders } from '@/testing/render'

import { LoginForm } from './login-form'

describe('loginForm', () => {
  it('calls router.push after successful login', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginForm />)

    await user.clear(screen.getByLabelText(/email/i))
    await user.type(screen.getByLabelText(/email/i), mockCredentials.valid.email)
    await user.clear(screen.getByLabelText(/password/i))
    await user.type(screen.getByLabelText(/password/i), mockCredentials.valid.password)
    await user.click(screen.getByRole('button', { name: /^login$/i }))

    await waitFor(
      () => {
        expect(vi.mocked(useRouter().push)).toHaveBeenCalledWith(
          expect.stringContaining('/dashboards/analytics'),
        )
      },
      { timeout: 10_000 },
    )
  })

  it('login button is present and enabled initially', () => {
    renderWithProviders(<LoginForm />)
    const button = screen.getByRole('button', { name: /^login$/i })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })
})
