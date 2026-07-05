export type CleanupInterval = ReturnType<typeof setInterval>;

export interface UnrefableTimer {
  unref(): void;
}
