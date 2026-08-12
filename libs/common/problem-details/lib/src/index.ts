import {
  composeProblemCatalog,
  isProblemCode,
  type ComposedProblemCatalog,
  type ProblemTypeDefinition,
  type ProblemTypeExtension,
} from './catalog-composition';

export * from './catalog-composition';

export const ProblemTypeDocumentationUrl = 'https://example.com/problems';
export const ProblemInstanceBaseUrl = 'https://example.com/problem-instances';

const RequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UriReferenceCharacterPattern = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/u;
const InvalidPercentEncodingPattern = /%(?![0-9A-Fa-f]{2})/u;
const UriReferenceResolutionBase = 'https://uri-reference.invalid/';

export const ProblemPresentationDisplays = ['toast', 'silent'] as const;
export type ProblemPresentationDisplay = (typeof ProblemPresentationDisplays)[number];

export const ProblemPresentationSeverities = ['error', 'warning', 'info', 'success'] as const;
export type ProblemPresentationSeverity = (typeof ProblemPresentationSeverities)[number];

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

export interface ProblemPresentationOverride {
  readonly comment?: string;
  readonly display: ProblemPresentationDisplay;
  readonly messageEn?: string;
  readonly messageRu?: string;
  readonly revision: number;
  readonly ruleId: string;
  readonly severity: ProblemPresentationSeverity;
  readonly updatedAt?: string;
}

export function isProblemPresentationDisplay(value: string): value is ProblemPresentationDisplay {
  return ProblemPresentationDisplays.includes(value as ProblemPresentationDisplay);
}

export function isProblemPresentationSeverity(value: string): value is ProblemPresentationSeverity {
  return ProblemPresentationSeverities.includes(value as ProblemPresentationSeverity);
}

export function problemTypeForCode(code: string): string {
  if (!isProblemCode(code)) {
    throw new TypeError(`Invalid problem code: ${JSON.stringify(code)}`);
  }

  return `${ProblemTypeDocumentationUrl}#${code}`;
}

/**
 * Product problem types registered on top of the base catalog.
 *
 * The base array stays a closed `as const` so `ProblemTypeCode` remains the
 * narrow union that exhaustive consumers (the frontend's translation map) rely
 * on; product codes widen the runtime registry only.
 */
const registeredExtensions: ProblemTypeExtension[] = [];
let composedCatalog: ComposedProblemCatalog = composeProblemCatalog({
  definitions: ProblemTypeDefinitions,
  extensions: [],
});

/** A base problem code, or any product code registered through `registerProblemTypes`. */
export type RegisteredProblemCode = ProblemTypeCode | (string & {});

export function registerProblemTypes(extension: ProblemTypeExtension): void {
  if (registeredExtensions.some((entry) => entry.id === extension.id)) {
    throw new Error(`problem extension "${extension.id}" is already registered`);
  }

  // Compose before mutating: a rejected extension must leave the registry exactly
  // as it was, or the second failure would be a confusing consequence of the first.
  composedCatalog = composeProblemCatalog({
    definitions: ProblemTypeDefinitions,
    extensions: [...registeredExtensions, extension],
  });
  registeredExtensions.push(extension);
}

/** The base catalog plus every registered product extension. */
export function registeredProblemTypeDefinitions(): readonly ProblemTypeDefinition[] {
  return composedCatalog.definitions;
}

export function getProblemTypeDefinition(code: string): ProblemTypeDefinition | undefined {
  return composedCatalog.definitionFor(code);
}

/** Resolves a type URI against the composed catalog, product codes included. */
export function registeredProblemCodeFromType(type: string | undefined): RegisteredProblemCode | undefined {
  return registeredProblemTypeDefinitions().find((definition) => problemTypeForCode(definition.code) === type)?.code;
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
