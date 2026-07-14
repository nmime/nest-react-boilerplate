const connectionCredentialPattern = new RegExp(
  ['([a-z][a-z0-9+.-]*://)', '([^\\s/@:]+)', ':', '([^\\s/@]+)', '@'].join(''),
  'giu',
);
const secretAssignmentPattern = /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^\s,;]+)/giu;

export function redactDependencyDetail(value: string): string {
  return value.replace(connectionCredentialPattern, '$1[redacted]@').replace(secretAssignmentPattern, '$1=[redacted]');
}
