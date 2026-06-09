export class SocketResponseDto<T = unknown> {
  constructor(
    public readonly data: {
      id: string | null;
      result?: T;
      error?: unknown;
    },
  ) {}
}

export interface SocketResultResponseDto {
  success: boolean;
  [key: string]: unknown;
}
