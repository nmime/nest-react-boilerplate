export function getQuorum(clientCount: number): number {
  return Math.floor(clientCount / 2) + 1;
}
