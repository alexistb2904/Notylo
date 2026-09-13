# Security Policy

## Reporting a vulnerability

Please do not disclose suspected security vulnerabilities in a public GitHub issue.

Report them privately to **contact@alexistb.com** with:

- the affected component or endpoint;
- reproduction steps or a proof of concept;
- the potential impact;
- any suggested mitigation, if available.

Please avoid accessing, modifying or retaining data that does not belong to you while investigating a vulnerability.

## Scope

Security reports are particularly useful for issues involving:

- authentication, sessions, JWTs or WebAuthn/passkeys;
- public share links and access-control bypasses;
- cross-account or cross-notebook data exposure;
- cloud synchronization and conflict handling;
- uploads, assets and MinIO storage;
- API validation, rate limiting, CORS or origin checks;
- desktop/Tauri capabilities and deep links;
- import/export parsing of untrusted files;
- accidental disclosure of private notebook content or credentials.

## Supported versions

Notylo is currently under active development. Security fixes target the current `main` branch and the latest published desktop release when applicable.

## Sensitive information

Do not include real passwords, access tokens, recovery credentials, private notebook contents or other users' personal data in reports or logs. Use minimal synthetic test data wherever possible.
