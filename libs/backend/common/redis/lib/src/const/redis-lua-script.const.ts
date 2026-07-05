// Lib-private fixed Lua scripts executed via EVAL for atomic lock-ownership and
// fixed-window counter operations. Intentionally NOT re-exported from
// const/index.ts: they are RedisClientAdapter internals and must stay out of
// the public @app/backend-common-redis API.
const deleteIfValueScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end

return 0
`;

const extendIfValueScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end

return 0
`;

const incrementWithWindowScript = `
local count = redis.call("incr", KEYS[1])
local ttl = redis.call("pttl", KEYS[1])
if ttl < 0 then
  redis.call("pexpire", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return {count, ttl}
`;

export const redisLuaScripts = Object.freeze({
  "delete-if-value": deleteIfValueScript,
  "extend-if-value": extendIfValueScript,
  "increment-window": incrementWithWindowScript,
} as const);

export type RedisLuaScriptName = keyof typeof redisLuaScripts;
