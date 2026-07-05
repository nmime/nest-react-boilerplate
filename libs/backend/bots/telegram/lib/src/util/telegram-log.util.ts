export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`);
}
