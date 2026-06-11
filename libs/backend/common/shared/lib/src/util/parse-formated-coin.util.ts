export const parseFormattedCoin = (value: string): number =>
  Number(value.replace(/[,_ ]/gu, ""));
