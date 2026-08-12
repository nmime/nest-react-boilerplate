#!/usr/bin/env bash
# Start the Compose runtime stack and block until every service is actually ready.
#
# This is the forge-neutral twin of .github/actions/runtime-stack. GitHub keeps a
# composite action because scripts/validate-github-workflows.mjs asserts the start
# sequence literally inside that action.yml; until that assertion is repointed at
# this script, the sequence has to exist in both places. Change one, change the other.
#
# `up --wait` is deliberately not used: it treats the one-shot `migrate` service
# exiting 0 as a failed wait. Readiness is asserted explicitly instead, so the
# frontend services — which plain `up -d` starts without waiting for — are serving
# before any gate runs.
set -uo pipefail

COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-docker/docker-compose.yml}"
START_ATTEMPTS="${START_ATTEMPTS:-3}"
READINESS_TIMEOUT="${READINESS_TIMEOUT:-300}"

dump_diagnostics() {
  docker compose -f "$COMPOSE_FILE_PATH" ps --all || :

  # A failed start prints only "container is unhealthy". The reason is in the
  # service log and the last healthcheck probe, so surface both.
  for container in $(docker compose -f "$COMPOSE_FILE_PATH" ps --all --quiet); do
    name="$(docker inspect --format '{{.Name}}' "$container" 2>/dev/null | sed 's|^/||')"
    state="$(docker inspect --format '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} exit={{.State.ExitCode}}' "$container" 2>/dev/null)"
    echo "--- ${name:-$container} ($state)"
    docker inspect \
      --format '{{if .State.Health}}{{range .State.Health.Log}}--- probe exit={{.ExitCode}}{{"\n"}}{{.Output}}{{end}}{{else}}no healthcheck{{end}}' \
      "$container" 2>/dev/null | tail -40 || :
    docker logs --tail 80 "$container" 2>&1 || :
  done
}

assert_ready() {
  local deadline=$((SECONDS + READINESS_TIMEOUT))

  while [ "$SECONDS" -lt "$deadline" ]; do
    local pending=''
    local failed=''

    for container in $(docker compose -f "$COMPOSE_FILE_PATH" ps --all --quiet); do
      local name status health exit_code
      name="$(docker inspect --format '{{.Name}}' "$container" 2>/dev/null | sed 's|^/||')"
      status="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null)"
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null)"
      exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container" 2>/dev/null)"

      # One-shot jobs (migrations, replica-set preparation) have no healthcheck
      # and are done when they exit cleanly.
      if [ "$health" = 'none' ]; then
        if [ "$status" = 'exited' ] && [ "$exit_code" != '0' ]; then
          failed="${failed} ${name}(exit=${exit_code})"
        elif [ "$status" != 'exited' ] && [ "$status" != 'running' ]; then
          pending="${pending} ${name}(${status})"
        fi
        continue
      fi

      case "$health" in
        healthy) ;;
        unhealthy) failed="${failed} ${name}(unhealthy)" ;;
        *) pending="${pending} ${name}(${health})" ;;
      esac
    done

    if [ -n "$failed" ]; then
      echo "Unhealthy service(s):${failed}" >&2
      return 1
    fi

    if [ -z "$pending" ]; then
      return 0
    fi

    sleep 5
  done

  echo "Timed out after ${READINESS_TIMEOUT}s waiting for the runtime stack." >&2
  return 1
}

for attempt in $(seq 1 "$START_ATTEMPTS"); do
  if docker compose -f "$COMPOSE_FILE_PATH" up -d --build && assert_ready; then
    echo "Runtime stack ready on attempt ${attempt}."
    exit 0
  fi

  echo "Runtime stack start attempt ${attempt} failed." >&2
  dump_diagnostics

  if [ "$attempt" -eq "$START_ATTEMPTS" ]; then
    echo "Runtime stack failed to start after ${attempt} attempt(s)." >&2
    exit 1
  fi

  # Reset to a clean slate so a half-started stack cannot poison the retry, then
  # back off to let the runner recover CPU and IO.
  docker compose -f "$COMPOSE_FILE_PATH" down --remove-orphans --volumes || :
  sleep "$((attempt * 15))"
done
