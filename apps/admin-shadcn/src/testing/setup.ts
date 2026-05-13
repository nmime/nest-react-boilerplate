import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { beforeAll, afterEach, afterAll, vi } from 'vitest'

import { clearAuthState } from '@/testing/auth-fixtures'
import { server } from '@/testing/msw/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  clearAuthState()
  mockRouter.push.mockClear()
  mockRouter.replace.mockClear()
  mockRouter.back.mockClear()
})
afterAll(() => server.close())

const mockRouter = {
  push: vi.fn<() => void>(),
  replace: vi.fn<() => void>(),
  back: vi.fn<() => void>(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  redirect: vi.fn<() => void>(),
}))
