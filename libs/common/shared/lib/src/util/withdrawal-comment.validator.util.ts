export const isValidWithdrawalComment = (value: string): boolean =>
  value.length <= 255;
