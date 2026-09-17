# Public reading and authenticated interactions

The existing `LYANN_ROUTER` owns the interaction policy and `requireAuthForInteraction(action, context)`. It consumes only `LYANN_AUTH_STATE`, backed by `LYANN_SESSION` and Supabase. CSS classes, local login flags, and the removed legacy `getCurrentUserId` lookup do not authenticate an interaction. This UI contract complements existing server authorization/RLS; it does not replace or relax them.

| Surface/action | Authentication | After login |
| --- | --- | --- |
| Explorer, Annonces, Lyanneurs, public Request/profile, Bokantaj reading, search, filters | Public | No login needed |
| Contact/messages | Required | Existing messaging route and original recipient |
| Publish Request | Required | Existing wizard, preserved search/prefill; no publication |
| Je peux aider | Required | Real Request detail; user confirms help again |
| Favorite/unfavorite | Required | Exact Request/profile and favorite button; user confirms desired change |
| Comment | Required | Same post's comment drawer; no submission |
| Reaction | Required | Same post/control; no automatic reaction |
| Community publishing | Required | Composer; no automatic publication |
| Proposal, acceptance/refusal, mission actions | Required | Existing context; never replay a submission |
| Personal/account sections | Required | Existing requested section |

`interactionPolicy`, `protectedControls` and `protectedForms` are the testable centralized matrix. The router's existing capture owner gates legacy controls and form submissions before their business handlers, including touch input. Routed actions use the same gate. Canonical wizard and favorite entry points also delegate to it rather than maintaining their own auth implementations. Closing login/registration cancels the intent; switching between login and registration preserves it.

An intent stores only allowlisted contextual strings and the current internal URL in tab-scoped sessionStorage. It expires after 15 minutes. Cross-origin or non-product destinations are rejected. Successful login consumes the intent before continuing, preventing replay on duplicate auth events/token refresh. The original path/query/hash survive navigation/reload. Ready callbacks wait for feature handlers to be installed; session resolution errors fail closed rather than leaving callers waiting forever. Backend errors are never converted to authenticated state.

Public Request detail opened by identifier now reuses the same public Explorer repository as discovery. It does not fall back to a raw anonymous `requests` query. Authenticated details and all messaging/favorite/proposal persistence remain owned by their existing implementations.

## Validation boundaries

`tests/e2e/auth_interaction_gate.spec.js` includes isolated tests executing the actual router policy, real anonymous browser controls, and real QA login returning to publication/Request/favorite context without business writes. The existing public-read and discovery suite still verifies profiles, Requests, Bokantaj, search, filters, and backend errors. The old mocked messaging/date-proposal test now supplies its mocked identity through the canonical auth-state interface, preserving its UI assertions.

Authenticated contact/conversation persistence and favorite persistence after login have permanent staging-only tests. They must not run against production. Full results are reported with executed/skipped counts, not as blanket certification of business persistence.

On 2026-09-18, read-only HTTP inspection of `https://lyann.app/v1/explorer/requests` returned 404 (`Cannot GET /v1/explorer/requests`). This deployed-domain failure is distinct from authentication gating; the accepted public endpoint exists in the current development branch. No production deployment, remote Supabase change, or RLS change is part of this task.

Final local validation on 2026-09-18: full Playwright suite **71 passed, 8 skipped, 0 failed** (79 tests); the new gate file contributes 20 passed and 2 staging-only skips. Architecture audits (`npm test`), shared mobile build (`npm run build:mobile`, 174 byte-identical root assets), and `git diff --check` passed. The new browser tests enforce no unexpected console errors or failed requests. Registration switching exposed missing signup links in legacy login templates; the existing auth setup now supplies that link and onboarding clears stale inline hiding when reopened. Login/register switching, cancellation, and publication return after reload passed. Real iPhone runtime and human Web validation were not performed.
