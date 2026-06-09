export interface CursorPaginationResponseDto<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}
