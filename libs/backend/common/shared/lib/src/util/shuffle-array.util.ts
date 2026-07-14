import { randomInt } from 'node:crypto';

export function shuffleArray<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    // Both indexes are provably in bounds (0 <= swapIndex <= index < length),
    // and T itself may include undefined, so a runtime guard would be wrong.
    const current = copy[index] as T;
    copy[index] = copy[swapIndex] as T;
    copy[swapIndex] = current;
  }

  return copy;
}
