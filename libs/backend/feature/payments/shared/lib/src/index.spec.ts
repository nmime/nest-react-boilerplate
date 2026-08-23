// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import { type CreatePaymentsDto, type PaymentsDto, PaymentsReadPermission, PaymentsWritePermission } from './index';

describe('PaymentsDto', () => {
  it('exports valid read and write permission strings', () => {
    expect(PaymentsReadPermission).toBe('payments:read');
    expect(PaymentsWritePermission).toBe('payments:write');
  });

  it('CreatePaymentsDto has a name property', () => {
    const dto: CreatePaymentsDto = { name: 'test' };
    expect(dto.name).toBe('test');
  });

  it('PaymentsDto has all required fields', () => {
    const dto: PaymentsDto = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Example',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(dto.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(dto.name).toBe('Example');
    expect(dto.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
