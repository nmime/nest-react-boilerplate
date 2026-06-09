export type FunctionMap = Record<string, (...args: never[]) => unknown>;

export const importAllFunctions = (map: FunctionMap): FunctionMap => map;
