import type { ValidationFunction } from "./validation-function.type";

export type HttpEndpointResponseMapping = Record<string, ValidationFunction>;
