export interface OpenApiSchemaObject {
  type?: string;
  example?: unknown;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, OpenApiSchemaObject>;
  items?: OpenApiSchemaObject;
  oneOf?: OpenApiSchemaObject[];
  additionalProperties?: boolean | OpenApiSchemaObject;
}
