import type {
  CleanupInterval,
  UnrefableTimer,
} from "../type/auth-token-cleanup-internal.type";

export function unrefTimer(timer: CleanupInterval): void {
  if (isUnrefableTimer(timer)) {
    timer.unref();
  }
}

function isUnrefableTimer(
  timer: CleanupInterval,
): timer is CleanupInterval & UnrefableTimer {
  return (
    typeof timer === "object" &&
    "unref" in timer &&
    typeof timer.unref === "function"
  );
}
