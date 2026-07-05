export interface OpenApiSchemaObject {
  type?: string;
  example?: unknown;
  description?: string;
  required?: string[];
  properties?: Record<string, OpenApiSchemaObject>;
  items?: OpenApiSchemaObject;
  additionalProperties?: boolean | OpenApiSchemaObject;
}
