import { describe, expect, it } from 'vitest';
import { SocketResponseDto } from './socket.response-dto';

describe('SocketResponseDto', () => {
  it('exposes the wrapped data payload', () => {
    const dto = new SocketResponseDto({ id: '1', result: { ok: true } });

    expect(dto.data).toEqual({ id: '1', result: { ok: true } });
  });

  it('supports a null id with an error payload', () => {
    const dto = new SocketResponseDto({ id: null, error: 'boom' });

    expect(dto.data.id).toBeNull();
    expect(dto.data.error).toBe('boom');
  });
});
