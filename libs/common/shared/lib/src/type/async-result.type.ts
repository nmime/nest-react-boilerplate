export type AsyncResult<T, E = Error> = Promise<
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: E;
    }
>;
