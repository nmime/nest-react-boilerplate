# Architecture Decision: Use Fastify over Express

| Field    | Value                                    |
| -------- | ---------------------------------------- |
| Status   | Accepted                                 |
| Date     | 2025-01-15                               |
| Authors  | @nmime                                   |
| Decision | Use Fastify as the HTTP server framework |

## Context

We evaluated Node.js HTTP frameworks for our NestJS-based backend services. The primary candidates were **Fastify** and **Express**. NestJS supports both, but the underlying platform affects performance, developer experience, and operational characteristics.

## Decision

We chose **Fastify** as the underlying HTTP platform for all NestJS backend services.

## Rationale

1. **Schema Validation**: Fastify has built-in JSON schema validation (via Ajv) for request bodies, query parameters, and parameters. Input validation is declarative and zero-cost at runtime (Ajv compiles schemas to JavaScript). Express requires middleware like `express-validator` or `joi` with manual integration.

2. **Serialization**: Fastify supports response schema serialization, ensuring API responses conform to contracts and reducing payload size. This is built-in and schema-driven.

3. **Lower Overhead**: Fastify uses a compiled routing approach (no regex per route) and minimizes middleware overhead. It is consistently 3-4x faster than Express in benchmarks (see Techempower).

4. **Better Performance**: Fastify's architecture (lightweight plugin system, non-blocking I/O defaults, compiled routes) yields higher throughput and lower latency under load, which is critical for our API surface.

5. **Developer Experience**: Fastify's logging (via Pino) is structured and performant by default. Its error handling model is clearer (errors flow through a central hook). The `find-my-way` router supports advanced patterns (AST-based routing, priority matching).

6. **NestJS Integration**: NestJS recommends Fastify as the default platform. The `@nestjs/platform-fastify` package is first-class with full feature parity.

## Express Considerations

Express has a larger ecosystem of middleware and a longer track record. However:

- No built-in schema validation or serialization
- Callback-based middleware model leads to "middleware hell" in large apps
- Significantly lower throughput in benchmarks
- No structured logging by default

## Consequences

- **Positive**: Higher throughput, built-in validation/serialization, structured logging, clearer error model, better DX with NestJS.
- **Negative**: Smaller middleware ecosystem than Express (mitigated by Fastify adapter support), learning curve for team members familiar only with Express.
- **Migration**: Existing Express middleware can be adapted via `@fastifyify/express-compatible` adapters where needed.

## References

- [Fastify Documentation](https://fastify.dev/)
- [NestJS Fastify Platform](https://docs.nestjs.com/fundamentals/technologies#fastify)
- [Techempower Framework Benchmarks](https://www.techempower.com/benchmarks/)
- [Ajv JSON Schema Validator](https://ajv.js.org/)
