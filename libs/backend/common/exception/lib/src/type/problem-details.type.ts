/** RFC 9457's open problem-details model. Every standard member is optional. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

/** The stricter profile emitted by this API at the HTTP boundary. */
export interface ProblemDetailsResponse extends ProblemDetails {
  type: string;
  title: string;
  status: number;
}
