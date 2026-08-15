## 1. Specification

- [x] 1.1 Record shared-builder and SSH probe scenarios on REQ-RUNTIME-DELIVERY-009.
- [x] 1.2 Map new executable tests in the version 3 sidecar.

## 2. Implementation

- [x] 2.1 Remove `RUNTIME_PROJECT` from the Dockerfile builder compile stage.
- [x] 2.2 Add the read-only SSH probe CLI.
- [x] 2.3 Add builder and SSH executable tests.
- [x] 2.4 Document `server:ssh-verify`.

## 3. Verification

- [x] 3.1 Run focused script tests and `spec:validate --skip-openspec`.
- [x] 3.2 Probe 142.132.231.156: host is reachable; BatchMode SSH is `Permission denied (publickey)` without an operator key.
