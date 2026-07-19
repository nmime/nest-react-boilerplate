export const ProblemTypeDocumentationUrl = 'https://example.com/problems';
export const ProblemInstanceBaseUrl = 'https://example.com/problem-instances';

const ProblemCodePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const RequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UriReferenceCharacterPattern = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/u;
const InvalidPercentEncodingPattern = /%(?![0-9A-Fa-f]{2})/u;
const UriReferenceResolutionBase = 'https://uri-reference.invalid/';

export interface ProblemTypeExtensionDefinition {
  readonly name: string;
  readonly description: string;
}

export interface ProblemTypeDefinition {
  readonly code: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly resolution: string;
  readonly extensions: readonly ProblemTypeExtensionDefinition[];
}

export const ProblemTypeDefinitions = [
  {
    code: 'client-data-validation',
    title: 'Client Data Validation Failed',
    status: 400,
    detail: 'One or more request members are invalid.',
    resolution: 'Correct the members identified by the errors extension and submit the request again.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
      {
        name: 'errors',
        description: 'Validation issues containing a human-readable detail and a JSON Pointer URI fragment.',
      },
    ],
  },
  {
    code: 'resource-conflict',
    title: 'Resource Conflict',
    status: 409,
    detail: 'The request conflicts with the current state of the resource.',
    resolution: 'Refresh the current resource state, resolve the conflict, and retry the request if appropriate.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
      {
        name: 'resourceType',
        description: 'Public resource category involved in the conflict, when safe to disclose.',
      },
      {
        name: 'field',
        description: 'Public field involved in the conflict, when safe to disclose.',
      },
    ],
  },
  {
    code: 'resource-not-found',
    title: 'Resource Not Found',
    status: 404,
    detail: 'The requested resource was not found.',
    resolution: 'Verify the resource identifier and that the caller is allowed to discover the resource.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
      {
        name: 'resourceType',
        description: 'Public resource category that was not found, when safe to disclose.',
      },
    ],
  },
  {
    code: 'rate-limited',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Too many requests were received in the current rate-limit window.',
    resolution: 'Wait for the duration indicated by Retry-After before retrying.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
    ],
  },
  {
    code: 'step-up-required',
    title: 'Step-up Authentication Required',
    status: 403,
    detail: 'Recent authentication is required to perform this security-sensitive action.',
    resolution: 'Authenticate again with an accepted method, then retry the action.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
    ],
  },
  {
    code: 'last-auth-method-unlink-forbidden',
    title: 'Last Authentication Method Cannot Be Unlinked',
    status: 409,
    detail: 'The last usable authentication method cannot be unlinked from the account.',
    resolution: 'Link another authentication method before unlinking this one.',
    extensions: [
      {
        name: 'code',
        description: 'Stable short alias for the problem type URI.',
      },
    ],
  },
] as const satisfies readonly ProblemTypeDefinition[];

export type ProblemTypeCode = (typeof ProblemTypeDefinitions)[number]['code'];

export function isProblemCode(value: string): boolean {
  return value.length <= 64 && ProblemCodePattern.test(value);
}

export function problemTypeForCode(code: string): string {
  if (!isProblemCode(code)) {
    throw new TypeError(`Invalid problem code: ${JSON.stringify(code)}`);
  }

  return `${ProblemTypeDocumentationUrl}#${code}`;
}

export function getProblemTypeDefinition(code: string): ProblemTypeDefinition | undefined {
  return ProblemTypeDefinitions.find((definition) => definition.code === code);
}

export function problemCodeFromType(type: string | undefined): ProblemTypeCode | undefined {
  return ProblemTypeDefinitions.find((definition) => problemTypeForCode(definition.code) === type)?.code;
}

export function problemInstanceForRequestId(requestId: string): string {
  if (!isRequestId(requestId)) {
    throw new TypeError('Invalid request identifier for problem instance.');
  }

  return `${ProblemInstanceBaseUrl}/${encodeURIComponent(requestId)}`;
}

export function isRequestId(value: string): boolean {
  return RequestIdPattern.test(value);
}

export function isUriReference(value: string): boolean {
  if (value.length === 0 || !UriReferenceCharacterPattern.test(value) || InvalidPercentEncodingPattern.test(value)) {
    return false;
  }

  try {
    new URL(value, UriReferenceResolutionBase);
    return true;
  } catch {
    return false;
  }
}
