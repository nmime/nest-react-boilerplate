import { describe, expect, it } from 'vitest';

import { configureApiLocale } from './api-locale';
import {
  ApiToastRuntime,
  createDefaultApiToastRules,
  parseApiToastRules,
  resolveApiToastRule,
  resolveApiToastRules,
  type ApiToastRule,
} from './toast-runtime';

describe('parseApiToastRules', () => {
  it('returns nothing for non-array input', () => {
    expect(parseApiToastRules('not an array')).toEqual([]);
    expect(parseApiToastRules(undefined)).toEqual([]);
  });

  it('drops malformed rule entries', () => {
    expect(
      parseApiToastRules([
        42,
        { match: 'nope', toast: { category: 'error', title: 'T' } },
        { match: {}, toast: 5 },
        { match: {}, toast: { category: 'error', title: 'T' } },
        { id: 'no-title', match: {}, toast: { category: 'error' } },
        {
          id: 'bad-category',
          match: {},
          toast: { category: 'nope', title: 'T' },
        },
        {
          id: 'bad-title-key',
          match: {},
          toast: { category: 'error', titleKey: 'not.a.translation.key' },
        },
      ]),
    ).toEqual([]);
  });

  it('normalizes match criteria and only keeps recognized display values', () => {
    const rules = parseApiToastRules([
      {
        display: 'modal',
        id: 'billing',
        match: {
          code: 'billing.declined',
          kind: 'network',
          statusRange: [500, 599],
          type: 'https://example.com/problems#resource-conflict',
        },
        toast: { category: 'error', message: 'Declined', title: 'Payment' },
      },
      {
        display: 'not-a-display',
        id: 'min-not-number',
        match: { endpoint: '/x', method: 'post', statusRange: ['x', 5] },
        toast: { category: 'info', title: 'Info' },
      },
      {
        id: 'max-not-number',
        match: { status: 404, statusRange: [400, 'y'] },
        toast: { category: 'warning', title: 'Warn' },
      },
      {
        id: 'range-not-array',
        match: { statusRange: '500-599' },
        toast: { category: 'success', title: 'Ok' },
      },
    ]);

    expect(rules[0]).toMatchObject({
      display: 'modal',
      id: 'billing',
      match: {
        code: 'billing.declined',
        kind: 'network',
        statusRange: [500, 599],
        type: 'https://example.com/problems#resource-conflict',
      },
      toast: { category: 'error', message: 'Declined', title: 'Payment' },
    });
    // Unrecognized display falls back to undefined.
    expect(rules[1]?.display).toBeUndefined();
    expect(rules[1]?.match).toEqual({ endpoint: '/x', method: 'post' });
    // statusRange entries that are not both numbers are discarded.
    expect(rules[2]?.match).toEqual({ status: 404 });
    expect(rules[3]?.match).toEqual({});
  });

  it('resolves generated translation keys and normalized problem messages at display time', () => {
    const runtime = new ApiToastRuntime({ clock: () => 1 });
    const rules = parseApiToastRules([
      {
        display: 'toast',
        id: 'generated-error',
        match: { status: 409 },
        toast: {
          category: 'error',
          messageSource: 'problem',
          titleKey: 'ui.runtime.requestFailed.title',
        },
      },
    ]);

    configureApiLocale({ locale: 'ru' });
    expect(runtime.showForApiResult({ message: 'Локализованная причина', status: 409 }, rules)).toMatchObject({
      message: 'Локализованная причина',
      title: 'Запрос не выполнен',
    });
  });
});

describe('resolveApiToastRule', () => {
  const rules = parseApiToastRules([
    {
      id: 'method-rule',
      match: { method: 'POST' },
      toast: { category: 'info', title: 'Method' },
    },
    {
      id: 'endpoint-rule',
      match: { endpoint: '/profiles/{profileId}' },
      toast: { category: 'info', title: 'Endpoint' },
    },
    {
      id: 'code-rule',
      match: { code: 'billing.declined' },
      toast: { category: 'error', title: 'Code' },
    },
    {
      id: 'type-rule',
      match: { type: 'https://example.com/problems#resource-conflict' },
      toast: { category: 'error', title: 'Type' },
    },
    {
      id: 'status-rule',
      match: { status: 404 },
      toast: { category: 'warning', title: 'Status' },
    },
    {
      id: 'range-rule',
      match: { statusRange: [500, 599] },
      toast: { category: 'error', title: 'Range' },
    },
  ]);

  it('returns null when no rule matches the context', () => {
    expect(resolveApiToastRule({ method: 'GET' }, rules)).toBeNull();
  });

  it('skips rules whose method, endpoint, code, or status differ', () => {
    const statusRule = rules[4];
    if (!statusRule) {
      throw new Error('Expected status rule fixture.');
    }

    expect(resolveApiToastRule({ method: 'GET', endpoint: '/other' }, rules)).toBeNull();
    expect(resolveApiToastRule({ code: 'other.code' }, rules)).toBeNull();
    expect(resolveApiToastRule({ type: 'https://example.com/problems#other' }, rules)).toBeNull();
    expect(resolveApiToastRule({ status: 500 }, [statusRule])).toBeNull();
  });

  it('matches on each individual criterion', () => {
    expect(resolveApiToastRule({ method: 'post' }, rules)).toMatchObject({
      id: 'method-rule',
    });
    expect(resolveApiToastRule({ endpoint: '/profiles/profile-1' }, rules)).toMatchObject({
      id: 'endpoint-rule',
    });
    expect(resolveApiToastRule({ endpoint: '/profiles' }, rules)).toBeNull();
    expect(resolveApiToastRule({ endpoint: '/profiles/' }, rules)).toBeNull();
    expect(resolveApiToastRule({ code: 'billing.declined' }, rules)).toMatchObject({ id: 'code-rule' });
    expect(resolveApiToastRule({ type: 'https://example.com/problems#resource-conflict' }, rules)).toMatchObject({
      id: 'type-rule',
    });
    expect(resolveApiToastRule({ status: 404 }, rules)).toMatchObject({
      id: 'status-rule',
    });
    expect(resolveApiToastRule({ status: 503 }, rules)).toMatchObject({
      id: 'range-rule',
    });
  });

  it('rejects a status-range rule when the status is missing or out of range', () => {
    const rangeRule = rules[5];
    if (!rangeRule) {
      throw new Error('Expected range rule fixture.');
    }
    const rangeOnly = [rangeRule];
    expect(resolveApiToastRule({}, rangeOnly)).toBeNull();
    expect(resolveApiToastRule({ status: 404 }, rangeOnly)).toBeNull();
    expect(resolveApiToastRule({ status: 600 }, rangeOnly)).toBeNull();
  });
});

describe('resolveApiToastRules', () => {
  it('resolves lazy rule sources', () => {
    const rules = createDefaultApiToastRules();
    expect(resolveApiToastRules(() => rules)).toBe(rules);
  });
});

describe('ApiToastRuntime defaults', () => {
  it('resolves default toast copy from the current frontend locale', () => {
    configureApiLocale({ locale: 'ru' });

    expect(createDefaultApiToastRules()[0]?.toast).toEqual({
      category: 'warning',
      message:
        'Подключитесь к сети, чтобы продолжить. Экран остаётся на текущем маршруте и безопасно повторяет запрос.',
      title: 'Нет подключения',
    });
  });

  it('uses a monotonic default id generator and dismisses by id', () => {
    const runtime = new ApiToastRuntime();

    const first = runtime.show({ category: 'info', title: 'One' });
    const second = runtime.show({ category: 'success', title: 'Two' });

    expect(first?.id).toBe('toast-1');
    expect(second?.id).toBe('toast-2');
    expect(runtime.visible.map((toast) => toast.id)).toEqual(['toast-1', 'toast-2']);

    runtime.dismiss('toast-1');
    expect(runtime.visible.map((toast) => toast.id)).toEqual(['toast-2']);

    runtime.dismiss('missing');
    expect(runtime.visible.map((toast) => toast.id)).toEqual(['toast-2']);
  });

  it('skips silent and modal rules in showForApiResult', () => {
    const runtime = new ApiToastRuntime();
    const rules = parseApiToastRules([
      {
        display: 'modal',
        id: 'modal-rule',
        match: { status: 500 },
        toast: { category: 'error', title: 'Modal' },
      },
    ]);

    expect(runtime.showForApiResult({ status: 500 }, rules)).toBeNull();
    expect(runtime.visible).toHaveLength(0);
  });

  it('fails closed when a manually supplied rule has no title source', () => {
    const runtime = new ApiToastRuntime();
    const rule = {
      display: 'toast',
      id: 'missing-title',
      match: { status: 500 },
      toast: { category: 'error' },
    } as ApiToastRule;

    expect(runtime.showForApiResult({ status: 500 }, [rule])).toBeNull();
  });
});
