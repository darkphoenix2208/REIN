# APIMatic / ContextMatic

**Status: Not Used**

This project provides a hand-authored OpenAPI 3.1 spec at `docs/api/openapi.yaml` documenting the `/v1` API endpoints.

APIMatic's ContextMatic tool (https://www.apimatic.io/contextmatic/) was **not** used for this submission. The OpenAPI spec was authored manually based on the actual Express route definitions in `server/app.ts`.

## Why Not Used

- **Time constraints**: The 6-8 hour hackathon window prioritized working features over tooling exploration
- **Manual authoring was faster**: The API surface is small (10 endpoints) and straightforward
- **No client SDKs needed**: The demo uses direct `fetch()` calls from the browser; auto-generated SDKs would add build complexity without delivering user value for this phase

## If Using ContextMatic in Future

To generate client SDKs or improved documentation using APIMatic's tools:

1. Upload `docs/api/openapi.yaml` to https://www.apimatic.io/contextmatic/
2. The spec is already OpenAPI 3.1 compliant with:
   - Component schemas for reusable types (Mandate, CheckResult, GateOutcome, LedgerRow)
   - Bearer auth security scheme
   - Example values in descriptions
3. Generate SDKs for target languages (TypeScript, Python, etc.)
4. The generated code would wrap the REST API in idiomatic client libraries

## What We Have Instead

- **OpenAPI spec**: `docs/api/openapi.yaml` — machine-readable API contract
- **Type definitions**: `server/types.ts` — TypeScript source of truth
- **Integration tests**: `tests/*.test.ts` — actual request/response validation
- **Demo client**: `app/src/lib/api.ts` — production fetch wrappers used by the UI

The spec is suitable for:
- Swagger UI / ReDoc rendering
- Postman/Insomnia import
- APIMatic ingestion if SDKs become necessary
- Contract testing tools (Prism, Dredd)

---

**Honesty note**: APIMatic/ContextMatic is a PayPal sponsor tool. We didn't use it because manual authoring was faster for this scope, not because of any limitation in the tool itself.
