export const createPairSymbol = (base: string, quote: string): string =>
  `${base.toUpperCase()}_${quote.toUpperCase()}`;
