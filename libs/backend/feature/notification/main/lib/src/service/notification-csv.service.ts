import { Injectable } from '@nestjs/common';
import {
  NotificationTargetType,
  type NotificationAudienceMember,
  type NotificationData,
} from '@app/common-notifications';

export interface ParsedNotificationCsv {
  members: NotificationAudienceMember[];
  totalRows: number;
  duplicateRows: number;
  invalidRows: number;
  errors: string[];
}

@Injectable()
export class NotificationCsvService {
  parse(bytes: Uint8Array, limits: { maxBytes: number; maxRows: number }): ParsedNotificationCsv {
    const { headers, dataRows } = readCsv(bytes, limits);
    const members = new Map<string, NotificationAudienceMember>();
    const errors: string[] = [];
    let duplicateRows = 0;
    let invalidRows = 0;
    for (const [index, row] of dataRows.entries()) {
      if (isBlankRow(row)) {
        continue;
      }
      try {
        duplicateRows += addMember(members, parseMember(headers, row));
      } catch (error) {
        invalidRows += 1;
        if (errors.length < 100) {
          errors.push(`Row ${index + 2}: ${safeCsvError(error)}`);
        }
      }
    }
    return { members: [...members.values()], totalRows: dataRows.length, duplicateRows, invalidRows, errors };
  }
}

function readCsv(
  bytes: Uint8Array,
  limits: { maxBytes: number; maxRows: number },
): { headers: string[]; dataRows: string[][] } {
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxBytes) {
    throw new Error('notification_csv_size');
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '');
  if (text.includes('\0')) {
    throw new Error('notification_csv_content');
  }
  const [headerRow, ...dataRows] = parseCsv(text);
  if (!headerRow || dataRows.length === 0) {
    throw new Error('notification_csv_empty');
  }
  if (dataRows.length > limits.maxRows) {
    throw new Error('notification_csv_rows');
  }
  const headers = headerRow.map((header) => header.trim());
  const invalidHeaders =
    new Set(headers).size !== headers.length ||
    !headers.includes('target_id') ||
    headers.some((header) => !/^[a-z][a-z0-9_]{0,63}$/u.test(header));
  if (invalidHeaders) {
    throw new Error('notification_csv_headers');
  }
  return { headers, dataRows };
}

function parseMember(headers: string[], row: string[]): NotificationAudienceMember {
  if (row.length !== headers.length) {
    throw new Error('column count does not match the header');
  }
  const values = Object.fromEntries(headers.map((header, column) => [header, row[column]?.trim() ?? '']));
  const targetType = parseTargetType(values['target_type']);
  const targetId = normalizeTarget(targetType, values['target_id'] ?? '');
  const language = values['language'] || undefined;
  if (language && language !== 'en' && language !== 'ru') {
    throw new Error('language must be en or ru');
  }
  const variables: NotificationData = {};
  for (const header of headers) {
    if (!reservedHeaders.has(header)) {
      variables[header] = values[header] ?? '';
    }
  }
  return {
    targetType,
    targetId,
    ...(language ? { language } : {}),
    ...(Object.keys(variables).length > 0 ? { variables } : {}),
  };
}

function addMember(members: Map<string, NotificationAudienceMember>, member: NotificationAudienceMember): number {
  const key = `${member.targetType}\u0000${member.targetId}`;
  const existing = members.get(key);
  if (!existing) {
    members.set(key, member);
    return 0;
  }
  if (JSON.stringify(existing) === JSON.stringify(member)) {
    return 1;
  }
  throw new Error('duplicate target has conflicting values');
}

const reservedHeaders = new Set(['target_id', 'target_type', 'language']);

function isBlankRow(row: string[]): boolean {
  return row.length === 1 && row[0]?.trim() === '';
}

// The branch structure is intrinsic to a bounded RFC 4180-style state machine.
// eslint-disable-next-line sonarjs/cognitive-complexity
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) {
    throw new Error('notification_csv_unclosed_quote');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ''));
    rows.push(row);
  }
  return rows;
}

function parseTargetType(value?: string): NotificationTargetType {
  if (!value) {
    return NotificationTargetType.User;
  }
  if (Object.values(NotificationTargetType).includes(value as NotificationTargetType)) {
    return value as NotificationTargetType;
  }
  throw new Error('unsupported target_type');
}

function normalizeTarget(type: NotificationTargetType, value: string): string {
  const normalized = type === NotificationTargetType.Email ? value.toLowerCase() : value;
  if (!normalized || normalized.length > 320 || /\s/u.test(normalized)) {
    throw new Error('invalid target_id');
  }
  if (type === NotificationTargetType.Email && !isStructurallyValidEmail(normalized)) {
    throw new Error('invalid email target');
  }
  return normalized;
}

function isStructurallyValidEmail(value: string): boolean {
  const at = value.indexOf('@');
  const dot = value.lastIndexOf('.');
  return at > 0 && at === value.lastIndexOf('@') && dot > at + 1 && dot < value.length - 1;
}

function safeCsvError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : 'invalid row';
}
