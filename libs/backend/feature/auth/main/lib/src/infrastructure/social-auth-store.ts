// Aggregator for the social-auth store. The port types, inject token, and the
// in-memory + Postgres adapters were decomposed into role-based sibling files;
// they are re-exported here so the infrastructure barrel stays stable.
export * from "./type/social-auth-store.type";
export * from "./const/social-auth-store.const";
export * from "./in-memory-social-auth.store";
export * from "./postgres-social-auth.store";
