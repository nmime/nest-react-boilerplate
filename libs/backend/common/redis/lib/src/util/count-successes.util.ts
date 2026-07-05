export function countSuccesses(
  results: Array<PromiseSettledResult<boolean>>,
): number {
  return results.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
}
