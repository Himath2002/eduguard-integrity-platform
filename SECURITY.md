# Security policy

EduGuard handles identity, coursework, assessment evidence, and feedback. Security reports should therefore avoid public issues when they contain exploit details, credentials, or user data.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](../../security/advisories/new) for sensitive findings. Include the affected component, reproduction steps, likely impact, and any suggested mitigation.

Please do not include real student submissions, access tokens, cloud credentials, or database exports in a report. Synthetic fixtures are preferred.

## Repository safeguards

- Real `.env` files and runtime uploads are excluded from version control.
- Cloud object storage is optional and is expected to use private objects and short-lived signed URLs.
- CI runs frontend verification, the PostgreSQL backend test suite, dependency auditing, and CodeQL analysis.
- Automated integrity signals are review evidence, not autonomous academic decisions.
