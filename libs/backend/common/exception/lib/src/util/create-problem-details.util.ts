import { isUriReference } from '@app/common-problem-details';
import type { ProblemDetailsResponse } from '../type/problem-details.type';

interface ProblemDetailsOptions {
  title: string;
  status: number;
  detail?: string;
  type?: string;
  instance?: string;
  extensions?: Readonly<Record<string, unknown>>;
}

const StandardMemberNames = new Set(['type', 'title', 'status', 'detail', 'instance']);
const ExtensionNamePattern = /^[A-Za-z]\w{2,}$/u;

function normalizeRequiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`Problem ${name} must be a non-empty string.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function assertStatus(status: number): void {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new RangeError('Problem status must be an integer from 100 through 599.');
  }
}

function normalizeUriReference(value: string, name: string): string {
  if (value !== value.trim() || !isUriReference(value)) {
    throw new TypeError(`Problem ${name} must be a valid URI reference.`);
  }

  return value;
}

function normalizeExtensions(extensions: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(extensions ?? {})) {
    if (StandardMemberNames.has(name)) {
      throw new TypeError(`Problem extension must not replace standard member ${JSON.stringify(name)}.`);
    }
    if (!ExtensionNamePattern.test(name)) {
      throw new TypeError(`Invalid problem extension name: ${JSON.stringify(name)}.`);
    }
    if (value !== undefined) {
      normalized[name] = value;
    }
  }

  return normalized;
}

export const createProblemDetails = ({
  title,
  status,
  detail,
  type = 'about:blank',
  instance,
  extensions,
}: ProblemDetailsOptions): ProblemDetailsResponse => {
  assertStatus(status);
  const normalizedType = normalizeUriReference(type, 'type');
  const normalizedTitle = normalizeRequiredText(title, 'title');
  const normalizedDetail = normalizeOptionalText(detail);
  const normalizedInstance = normalizeOptionalText(instance);

  return {
    type: normalizedType,
    title: normalizedTitle,
    status,
    ...(normalizedDetail ? { detail: normalizedDetail } : {}),
    ...(normalizedInstance ? { instance: normalizeUriReference(normalizedInstance, 'instance') } : {}),
    ...normalizeExtensions(extensions),
  };
};
