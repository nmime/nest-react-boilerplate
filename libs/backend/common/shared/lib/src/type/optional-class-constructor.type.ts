export type OptionalClassConstructor<T = unknown> =
  (new (...args: never[]) => T) | undefined;
