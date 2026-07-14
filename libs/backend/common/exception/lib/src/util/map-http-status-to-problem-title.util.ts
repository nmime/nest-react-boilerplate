import { HttpStatus } from '@nestjs/common';

export const mapHttpStatusToProblemTitle = (status: number): string => {
  const title = (HttpStatus as unknown as Record<number, string>)[status];
  return typeof title === 'string'
    ? title
        .toLowerCase()
        .split('_')
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Unexpected Error';
};
