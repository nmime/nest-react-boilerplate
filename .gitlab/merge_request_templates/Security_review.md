## Security Review Checklist

- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all user-facing endpoints
- [ ] Authentication required for protected routes
- [ ] Rate limiting configured
- [ ] CORS properly restricted
- [ ] SQL injection risk assessed
- [ ] Dependencies audited (run `pnpm audit`)
- [ ] Secret scan passed (gitleaks)

## Threat model
