import { Type } from '@mikro-orm/core';

const epoch = (): Date => new Date(0);

/**
 * A timestamp whose "never happened" is stored as the epoch instead of as `null`.
 *
 * Every timestamp column in this schema is `NOT NULL`, because a nullable column lets a row exist
 * in a state no invariant covers — `last_login_at` has recorded "never" as `'epoch'::timestamptz`
 * since the table was created. The domain still wants `null` for that case, and this type is where
 * the two representations meet: the sentinel never escapes the driver, and `null` never reaches
 * the column.
 */
export class NullableEpochDateType extends Type<Date | null, Date> {
  override convertToDatabaseValue(value: Date | null | undefined): Date {
    return value ?? epoch();
  }

  override convertToJSValue(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    const stored = value instanceof Date ? value : new Date(value);

    return stored.getTime() === epoch().getTime() ? null : stored;
  }

  override getColumnType(): string {
    return 'timestamptz';
  }
}
