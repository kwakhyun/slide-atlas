# Security scope

Slide Atlas is an independent portfolio demonstrator, not a multi-user enterprise system. Do not submit personal data, customer materials, private company templates, or confidential briefs to the public demo.

## Implemented controls

- Random 256-bit session token in an HttpOnly, SameSite=Lax cookie; Secure on HTTPS. Only its SHA-256 hash is stored server-side.
- Every repository read/write is scoped to a server-resolved workspace. A caller cannot select a workspace by a query or JSON field.
- Parameterized SQL, Zod input contracts, JSON-only mutation payloads, bounded streamed request bodies, origin checks, and explicit state transitions.
- Transactional audit events and version conflicts instead of silent last-write-wins.
- Private/no-store API responses, escaped SVG/XML text, attachment export, no user HTML evaluation or remote image fetching.
- CSP, frame denial, nosniff, referrer policy. `unsafe-eval` is development-only; production currently permits inline hydration scripts/styles, so this is not a nonce-based strict CSP.
- Public AI disabled by default; server-side key, invite code, output schema validation, request timeout and global daily request cap. Serverless AI requires an external PostgreSQL URL so the cap is shared across instances.
- No API credentials in client bundles or application error responses. Provider text and incoming briefs are not logged.

## Known limits

- Cookie spaces isolate demonstration visitors; they are not accounts, SSO, RBAC, or a guarantee of access after clearing cookies.
- PostgreSQL row-level security is not enabled. Isolation is enforced by repository queries and tested across independent sessions. An enterprise system should add defense in depth and separate reviewer permissions.
- Rate limiting is per anonymous session, except for the global AI cap. It is not bot protection and can be bypassed by creating new anonymous sessions. Use platform firewall/rate policies before operating at scale.
- Workspace capacity is capped, but admission and per-workspace object counts are not hardened distributed quotas. No load or denial-of-service certification is claimed.
- Seven-day expiration is checked on access; expired data is physically cleaned on the next new workspace. There is no promised background purge SLA.
- Text-fit checks estimate font metrics. Numeric matching does not validate meaning, units, truth, or whether a claim belongs to that number. Human review remains necessary.
- Template history currently detects version drift but does not store immutable historical geometry.
- The public preview is not a place for third-party file uploads; JSON imports accept only the bounded ontology schema. PPTX import is not supported.

To report a problem, use the repository's private vulnerability reporting feature if enabled. Otherwise open an issue describing impact without posting credentials, user content, or exploit data that exposes another visitor. Never paste an API key into an issue or chat; rotate exposed credentials with the provider.
