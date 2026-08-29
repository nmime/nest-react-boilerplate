# Payments scaffold

The backend route, PostgreSQL persistence module, production-registered migration, and frontend page boundary are generated.

## Finish the product flow

1. Define or replace `REQ-PAYMENTS-SCAFFOLD-001` in OpenSpec and map the generated backend shared, main, and PostgreSQL projects before running `pnpm spec:validate`.
2. Run `pnpm api:contracts` and `pnpm api:clients` after the API compiles.
3. Add a frontend API wrapper that imports only `@app/frontend-api-client`.
4. Register the page in the owning application router with translated copy.
5. Add component and e2e coverage for loading, error, empty, success, auth, and RBAC states.
