import { createHash } from 'node:crypto';
import type {
  ApiResponseStudioEnumChoice,
  ApiResponseStudioMethod,
  ApiResponseStudioParsedVariant,
  ApiResponseStudioStatus,
} from '@app/backend-feature-auth-shared';

const HttpMethods = new Set<ApiResponseStudioMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
  'TRACE',
]);
const HealthPattern = /(?:^|\/)(?:health|healthz|live|liveness|ready|readiness|metrics|version)(?:\/|$)/iu;
const DefaultMaxDepth = 10;
const DefaultMaxNodes = 2000;
const DefaultMaxSnapshotBytes = 64 * 1024;
const DefaultEnumExpansionCap = 32;

interface ParseOptions {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxSnapshotBytes?: number;
  readonly enumExpansionCap?: number;
  readonly enumChoicesByBaseKey?: Readonly<Record<string, readonly ApiResponseStudioEnumChoice[]>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const stableStringify = (value: unknown): string => JSON.stringify(sortValue(value)) ?? 'null';
const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
};
const boundedSnapshot = (value: unknown, maxBytes: number): string => {
  const serialized = stableStringify(value);
  return Buffer.byteLength(serialized, 'utf8') <= maxBytes
    ? serialized
    : stableStringify({ $truncated: true, bytes: Buffer.byteLength(serialized, 'utf8') });
};
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const localRefSegments = (ref: string): string[] | null => {
  if (!ref.startsWith('#/')) return null;
  return ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
};
const getAtRef = (document: Record<string, unknown>, ref: string): unknown => {
  const segments = localRefSegments(ref);
  if (!segments) return { $ref: ref };
  let value: unknown = document;
  for (const segment of segments) {
    if (!isRecord(value)) return { $ref: ref };
    value = value[segment];
  }
  return value;
};

const resolveSchema = (
  document: Record<string, unknown>,
  value: unknown,
  limits: Required<Pick<ParseOptions, 'maxDepth' | 'maxNodes'>>,
  state: { nodes: number; refs: Set<string> },
  depth = 0,
): unknown => {
  if (depth > limits.maxDepth || state.nodes >= limits.maxNodes) return { $truncated: true };
  state.nodes += 1;
  if (Array.isArray(value)) return value.map((item) => resolveSchema(document, item, limits, state, depth + 1));
  if (!isRecord(value)) return value;
  const ref = typeof value.$ref === 'string' ? value.$ref : undefined;
  if (ref) {
    if (state.refs.has(ref)) return { $circular: ref };
    state.refs.add(ref);
    const resolved = resolveSchema(document, getAtRef(document, ref), limits, state, depth + 1);
    state.refs.delete(ref);
    return isRecord(resolved) ? { ...resolved, $name: ref.split('/').at(-1) } : resolved;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, resolveSchema(document, value[key], limits, state, depth + 1)]),
  );
};

const schemaVariants = (schema: unknown): unknown[] => {
  if (!isRecord(schema)) return [schema];
  for (const keyword of ['oneOf', 'anyOf'] as const) {
    const variants = schema[keyword];
    if (Array.isArray(variants) && variants.length > 0) return variants;
  }
  const allOf = schema.allOf;
  if (Array.isArray(allOf) && allOf.length > 0) {
    const merged = allOf.reduce<Record<string, unknown>>((acc, item) => {
      if (!isRecord(item)) return acc;
      const properties = isRecord(item.properties) ? item.properties : {};
      const required = Array.isArray(item.required) ? item.required : [];
      return {
        ...acc,
        ...item,
        properties: { ...(isRecord(acc.properties) ? acc.properties : {}), ...properties },
        required: [...new Set([...(Array.isArray(acc.required) ? acc.required : []), ...required])],
      };
    }, {});
    return [merged];
  }
  return [schema];
};

const DiscriminatorKeys = ['error_type', 'errorType', 'code', 'type'] as const;

const schemaDiscriminator = (schema: unknown): string => {
  if (!isRecord(schema) || !isRecord(schema.properties)) return '';
  for (const key of DiscriminatorKeys) {
    const property = isRecord(schema.properties[key]) ? schema.properties[key] : undefined;
    if (!property) continue;
    for (const keyword of ['const', 'default', 'example']) {
      const discriminator = property[keyword];
      if (typeof discriminator === 'string' && discriminator.trim()) return discriminator.trim().slice(0, 200);
    }
    if (Array.isArray(property.enum) && property.enum.length === 1) {
      const discriminator = property.enum[0];
      if (typeof discriminator === 'string' && discriminator.trim()) return discriminator.trim().slice(0, 200);
    }
  }
  return '';
};

const recordDiscriminator = (value: unknown, includeType: boolean): string => {
  if (!isRecord(value)) return '';
  for (const key of DiscriminatorKeys) {
    if (key === 'type' && !includeType) continue;
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 200);
  }
  return '';
};

const errorTypeFor = (schema: unknown, example: unknown): string =>
  schemaDiscriminator(schema) || recordDiscriminator(example, true) || recordDiscriminator(schema, false);

const collectEnums = (
  schema: unknown,
  prefix = '',
  result: ApiResponseStudioEnumChoice[] = [],
): ApiResponseStudioEnumChoice[] => {
  if (!isRecord(schema)) return result;
  if (Array.isArray(schema.enum)) {
    const values = schema.enum.map(String).sort();
    if (values.length > 0) result.push({ property: prefix || '$value', values, enabledValues: [] });
  }
  const properties = schema.properties;
  if (isRecord(properties)) {
    for (const key of Object.keys(properties).sort())
      collectEnums(properties[key], prefix ? `${prefix}.${key}` : key, result);
  }
  if (schema.items) collectEnums(schema.items, `${prefix}[]`, result);
  for (const keyword of ['oneOf', 'allOf', 'anyOf']) {
    const variants = schema[keyword];
    if (Array.isArray(variants))
      variants.forEach((item, index) => collectEnums(item, `${prefix}.${keyword}[${index}]`, result));
  }
  return result;
};

const expansionSuffixes = (
  choices: readonly ApiResponseStudioEnumChoice[],
  cap: number,
): Array<{ suffix: string; choices: ApiResponseStudioEnumChoice[] }> => {
  const axes = choices
    .map((choice) => ({
      ...choice,
      enabledValues: [...choice.enabledValues].filter((value) => choice.values.includes(value)).sort(),
    }))
    .filter((choice) => choice.enabledValues.length > 0)
    .sort((a, b) => a.property.localeCompare(b.property));
  if (axes.length === 0) return [{ suffix: '', choices: choices.map((choice) => ({ ...choice })) }];
  const results: Array<{ suffix: string; choices: ApiResponseStudioEnumChoice[] }> = [];
  const walk = (index: number, values: string[]) => {
    if (results.length >= cap) return;
    if (index >= axes.length) {
      results.push({
        suffix: values.map((value) => encodeURIComponent(value)).join('~'),
        choices: choices.map((choice) => ({ ...choice })),
      });
      return;
    }
    for (const value of axes[index]?.enabledValues ?? []) walk(index + 1, [...values, value]);
  };
  walk(0, []);
  return results;
};

export const parseOpenApiResponses = (
  document: Record<string, unknown>,
  options: ParseOptions = {},
): ApiResponseStudioParsedVariant[] => {
  const openapi = typeof document.openapi === 'string' ? document.openapi : '';
  if (!/^3(?:\.\d+){1,2}(?:[-+].*)?$/u.test(openapi)) throw new Error('OpenAPI 3.x document is required.');
  const paths = isRecord(document.paths) ? document.paths : {};
  const maxDepth = options.maxDepth ?? DefaultMaxDepth;
  const maxNodes = options.maxNodes ?? DefaultMaxNodes;
  const maxSnapshotBytes = options.maxSnapshotBytes ?? DefaultMaxSnapshotBytes;
  const enumExpansionCap = options.enumExpansionCap ?? DefaultEnumExpansionCap;
  const variants: ApiResponseStudioParsedVariant[] = [];
  for (const path of Object.keys(paths).sort()) {
    if (HealthPattern.test(path)) continue;
    const pathItem = paths[path];
    if (!isRecord(pathItem)) continue;
    for (const rawMethod of Object.keys(pathItem).sort()) {
      const method = rawMethod.toUpperCase() as ApiResponseStudioMethod;
      if (!HttpMethods.has(method)) continue;
      const operation = pathItem[rawMethod];
      if (!isRecord(operation)) continue;
      const tags = Array.isArray(operation.tags) ? operation.tags.map(String).filter(Boolean).sort() : [];
      const tag = tags[0] ?? 'default';
      const operationId = typeof operation.operationId === 'string' ? operation.operationId : '';
      const summary = typeof operation.summary === 'string' ? operation.summary : '';
      const responses = isRecord(operation.responses) ? operation.responses : {};
      const statuses = Object.keys(responses).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const statusKey of statuses) {
        const response = responses[statusKey];
        if (!isRecord(response)) continue;
        const status: ApiResponseStudioStatus = /^\d{3}$/u.test(statusKey) ? (statusKey as `${number}`) : 'default';
        const description = typeof response.description === 'string' ? response.description : '';
        const content = isRecord(response.content) ? response.content : {};
        const media =
          (isRecord(content['application/problem+json']) && content['application/problem+json']) ||
          (isRecord(content['application/json']) && content['application/json']) ||
          Object.values(content).find(isRecord) ||
          {};
        const unresolvedSchema = isRecord(media) ? media.schema : undefined;
        const example = isRecord(media)
          ? (media.example ?? (isRecord(media.examples) ? Object.values(media.examples)[0] : undefined))
          : undefined;
        const resolved = resolveSchema(
          document,
          unresolvedSchema,
          { maxDepth, maxNodes },
          { nodes: 0, refs: new Set() },
        );
        const resolvedVariants = schemaVariants(resolved);
        for (const schema of resolvedVariants) {
          const errorType = errorTypeFor(schema, example);
          const baseKey = `${method}:${path}:${status}:${errorType || '-'}`;
          const discoveredChoices = collectEnums(schema);
          const persisted = options.enumChoicesByBaseKey?.[baseKey] ?? [];
          const choices = discoveredChoices.map((choice) => ({
            ...choice,
            enabledValues: persisted.find((item) => item.property === choice.property)?.enabledValues ?? [],
          }));
          for (const expansion of expansionSuffixes(choices, enumExpansionCap)) {
            const stableKey = expansion.suffix ? `${baseKey}:${expansion.suffix}` : baseKey;
            const schemaSnapshot = boundedSnapshot(schema, maxSnapshotBytes);
            const exampleSnapshot = boundedSnapshot(example ?? null, maxSnapshotBytes);
            variants.push({
              stableKey,
              tag,
              method,
              path,
              operationId,
              summary,
              status,
              errorType,
              description,
              schemaSnapshot,
              exampleSnapshot,
              enumChoices: expansion.choices,
              sourceFingerprint: hash(
                stableStringify({
                  tag,
                  method,
                  path,
                  operationId,
                  summary,
                  status,
                  errorType,
                  description,
                  schemaSnapshot,
                  exampleSnapshot,
                  choices: expansion.choices,
                }),
              ),
            });
          }
        }
      }
      for (const synthetic of ['ERR', 'NET'] as const) {
        const stableKey = `${method}:${path}:${synthetic}:-`;
        const description =
          synthetic === 'ERR'
            ? 'Unhandled request error before an HTTP response was available.'
            : 'Network error while reaching the service.';
        variants.push({
          stableKey,
          tag,
          method,
          path,
          operationId,
          summary,
          status: synthetic,
          errorType: '',
          description,
          schemaSnapshot: '',
          exampleSnapshot: '',
          enumChoices: [],
          sourceFingerprint: hash(stableStringify({ stableKey, description })),
        });
      }
    }
  }
  return variants.sort((a, b) => a.stableKey.localeCompare(b.stableKey));
};
