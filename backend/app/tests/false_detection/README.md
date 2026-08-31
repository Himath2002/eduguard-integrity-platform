# False Detection backend tests

This test pack covers the backend rules for false-detection review and validation.

Included coverage:

- override payload validation and removed-range checks
- recalculation helper coverage
- lecturer-only access and scoped submission access
- persistence of the latest override snapshot
- immutable override version creation
- audit event creation
- idempotency-key replay behaviour
- soft edit-lock helper behaviour
