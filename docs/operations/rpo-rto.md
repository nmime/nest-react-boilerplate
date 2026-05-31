# RPO/RTO policy

- **Production RPO:** 60 minutes for PostgreSQL data, enforced by an hourly
  backup CronJob and stale-backup alert.
- **Production RTO:** 60 minutes for database restore once a target cluster is
  available; 4 hours for complete application rebuild including DNS/ingress.
- **Backup retention:** at least 14 days of hourly recovery points in durable
  object storage; extend to meet legal/compliance requirements.
- **Encryption:** all durable backup artifacts must be encrypted before leaving
  the cluster boundary. Store encryption recipients/keys in the platform secret
  manager, not in Git.
- **Drills:** run a dry-run restore check in CI and a real restore drill at least
  quarterly. Capture actual restore duration and compare with the RTO.
