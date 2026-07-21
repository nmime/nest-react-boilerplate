import { describe, expect, it } from 'vitest';
import { NotificationTargetType } from '@app/common-notifications';
import { NotificationCsvService } from './notification-csv.service';

const encode = (value: string) => new TextEncoder().encode(value);

describe(NotificationCsvService.name, () => {
  const service = new NotificationCsvService();
  const limits = { maxBytes: 10_000, maxRows: 10 };

  it('parses localized RFC 4180 rows and normalizes email targets', () => {
    const result = service.parse(
      encode('\uFEFFtarget_id,target_type,language,first_name\r\n"USER@Example.COM",email,ru,"Ada, Jr."\r\n'),
      limits,
    );

    expect(result).toMatchObject({ duplicateRows: 0, invalidRows: 0, totalRows: 1 });
    expect(result.members).toEqual([
      {
        targetId: 'user@example.com',
        targetType: NotificationTargetType.Email,
        language: 'ru',
        variables: { first_name: 'Ada, Jr.' },
      },
    ]);
  });

  it('deduplicates identical rows and reports conflicting variables without replacing the first member', () => {
    const result = service.parse(
      encode('target_id,language,plan\nuser-1,en,free\nuser-1,en,free\nuser-1,ru,pro\n'),
      limits,
    );

    expect(result.members).toHaveLength(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.errors[0]).toContain('conflicting values');
  });

  it('fails closed for invalid headers, broken UTF-8, and configured limits', () => {
    expect(() => service.parse(encode('email\na@example.com\n'), limits)).toThrow('notification_csv_headers');
    expect(() => service.parse(Uint8Array.from([0xc3, 0x28]), limits)).toThrow();
    expect(() => service.parse(encode('target_id\na\nb\n'), { ...limits, maxRows: 1 })).toThrow(
      'notification_csv_rows',
    );
    expect(() => service.parse(encode('target_id\na\n'), { ...limits, maxBytes: 1 })).toThrow('notification_csv_size');
  });
});
