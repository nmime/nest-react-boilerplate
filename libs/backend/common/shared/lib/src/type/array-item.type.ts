export type ArrayItem<T> = T extends readonly (infer I)[] ? I : never;
