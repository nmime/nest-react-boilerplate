// @requirements REQ-AUTH-FRONTEND-009
import { describe, expect, it, vi } from 'vitest';
import { requestLogout } from './logout-api';

describe('requestLogout', () => {
  it('calls the auth logout endpoint with the client request options', async () => {
    const authControllerLogout = vi
      .fn()
      .mockResolvedValue({ data: { data: { ok: true } }, response: new Response(null) });
    const requestOptions = { headers: { 'Accept-Language': 'en' } };

    await expect(requestLogout({ api: { authControllerLogout }, requestOptions } as never)).resolves.toEqual({
      ok: true,
    });
    expect(authControllerLogout).toHaveBeenCalledWith(requestOptions);
  });
});
