// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { NullableEpochDateType } from './nullable-epoch-date.type';

const type = new NullableEpochDateType();

describe('NullableEpochDateType', () => {
  it('writes "never happened" to the column as the epoch', () => {
    expect(type.convertToDatabaseValue(null)).toEqual(new Date(0));
    expect(type.convertToDatabaseValue(undefined)).toEqual(new Date(0));
  });

  it('writes a real timestamp verbatim', () => {
    const verifiedAt = new Date('2026-02-02T00:00:00.000Z');

    expect(type.convertToDatabaseValue(verifiedAt)).toBe(verifiedAt);
  });

  it('reads the epoch back as null so the sentinel never escapes the driver', () => {
    expect(type.convertToJSValue(new Date(0))).toBeNull();
    expect(type.convertToJSValue('1970-01-01T00:00:00.000Z')).toBeNull();
  });

  it('reads a real timestamp back as a Date', () => {
    expect(type.convertToJSValue(new Date('2026-02-02T00:00:00.000Z'))).toEqual(new Date('2026-02-02T00:00:00.000Z'));
    expect(type.convertToJSValue('2026-02-02T00:00:00.000Z')).toEqual(new Date('2026-02-02T00:00:00.000Z'));
  });

  it('passes a missing value straight through rather than inventing the epoch', () => {
    // The column is NOT NULL so this cannot come from a row, but a partially selected entity can
    // still reach the converter, and answering "verified at the epoch" there would be a lie.
    expect(type.convertToJSValue(null)).toBeNull();
    expect(type.convertToJSValue(undefined)).toBeNull();
  });

  it('declares the same column type the migration writes', () => {
    expect(type.getColumnType()).toBe('timestamptz');
  });
});
