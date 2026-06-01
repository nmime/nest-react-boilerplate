#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const has = (text, needle, label = needle) =>
  assert.ok(text.includes(needle), `Missing expected Helm rate-limit config: ${label}`);

const values = read('.helm/values.yaml');
has(values, 'rateLimitEnabled: "true"', 'default rate limiting enabled');
has(values, 'rateLimitStore: auto', 'default rate-limit store is configurable/auto');
has(values, 'redisUrl: ""', 'default Redis URL knob');
has(values, 'redisHosts: ""', 'default Redis hosts knob');
has(values, 'redisKeyPrefix: "nrb:"', 'default Redis key prefix');

const productionValues = read('.helm/values-production.yaml');
has(productionValues, 'rateLimitStore: redis', 'production values force shared Redis rate limiting');
has(
  productionValues,
  'redisUrl: redis://redis-master.databases.svc.cluster.local:6379/0',
  'production values point APIs at shared Redis',
);
has(productionValues, 'redisKeyPrefix: "nrb:"', 'production Redis key prefix');

const configMap = read('.helm/templates/configmap.yaml');
for (const key of [
  'RATE_LIMIT_ENABLED:',
  'RATE_LIMIT_STORE:',
  'RATE_LIMIT_WINDOW_MS:',
  'RATE_LIMIT_MAX:',
  'REDIS_KEY_PREFIX:',
  'REDIS_URL:',
  'REDIS_HOSTS:',
]) {
  has(configMap, key, `ConfigMap renders ${key}`);
}

console.log('helm rate-limit config assertions passed');
