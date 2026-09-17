# Explorer / Bokantaj — implementation and validation

Date: 2026-09-17. Branch: `architecture-stabilization`.

BASELINE SHA: `aeee9d7e3a85db97116ae3640885399c0d16082d`

PRE-RC REVIEW SHA: `aeee9d7e3a85db97116ae3640885399c0d16082d` — changes remain in the working tree; no commit, merge or deployment.

Status: implementation available locally; end-to-end business certification **incomplete** pending an approved non-production backend for persistent business journeys. Anonymous discovery now uses the public server projection described below.

## Architecture discovered

- Explorer is `results.html`, vanilla JavaScript, canonical router/surfaces and repository/cache modules. Its old renderer searched profiles and included invented rating/distance fallbacks. The replacement uses real records only.
- Bokantaj is `feed.html` → `bokantaj-repository.js` → `api-client.js.getFeed`. Previously the API merged `requests` into community posts. It now reads `bokantaj_posts` only, with an additional repository boundary excluding Request entries.
- Requests are persisted in `requests`; the existing wizard, Request detail modal, invitations and creation API are reused. A database-generated identity is used. No duplicate community publication is created.
- Public identity comes from `public_profiles`; services come from active `services` rows with `owner_id`, `title`, `description`, `category`, `price_type`, `base_price`. The duplicate, incompatible `getUserServices` implementation was removed. The canonical public profile surface remains `openPublicMemberProfile` / `profile-repository.js`.
- Taxonomy is the existing `lyann_taxonomy` table, including universe/category/subcategory, synonyms and IDs. Strict database loading prevents discovery from silently replacing a backend failure with baseline taxonomy fixtures. Legacy service records have textual categories rather than taxonomy foreign keys; matching uses the same canonical labels/synonyms without persisting guessed IDs or creating another taxonomy.
- Messaging remains owned by the router, messaging UI/repository and chat core. Explorer passes Request/requester context to the current `messages` route. `initiate_lyann_help_conversation` writes an invitation; contact can create a conversation. Neither is a read-only validation action. Proposals use `create_request_quote` / `accept_request_quote`; missions remain separate entities.
- The initial tree already contained a one-line `chat-logic.js` fix and an untracked `messaging_and_date_proposal.spec.js`. Those changes were preserved and are not authored by this feature.

## Implementation

- **Annonces:** public Requests, recency ordering, real requester, title/description, location, urgency, budget, status, details, canonical favorite controls and help action. Own Requests and non-OPEN Requests have no help action.
- **Lyanneurs:** real public profiles and active services, identity/avatar, published services, recorded location and professional flag. Matching services are displayed first. Canonical profile and contact navigation are reused. No invented availability, verification, reputation or distance.
- **Search/categories:** accent-normalized text, shared category/service choices, contextual input and persistent URL state. Categories survive switching modes. There is no second taxonomy.
- **Filters/location:** advanced dialog with service, textual location, and Request status/urgency/budget. Saved profile location is reused when no explicit URL area exists. Removable active filters and an expand-area action are provided. Matching tolerates code/name order differences between saved `Guadeloupe (971)` and Request `971 - Guadeloupe`. Location matching is textual; no kilometre claim is made.
- **Bokantaj:** only community posts; the “Besoin d’un coup de main” entry remains and publishes through the existing Request wizard into Explorer. Community defaults to `info`. Photo uploads now use the existing `bokantaj-media` bucket with the authenticated user's folder; obsolete stored blob URLs are not rendered. Upload persistence still needs staging execution.
- **Related root-cause correction:** Bokantaj's sidebar queried nonexistent `profiles.primary_activity` and `rating`, causing HTTP 400. It now reuses the Explorer repository and shows real published services, without fabricated badges or scores.
- **Mobile/desktop:** responsive single/two/three-column layout, native filter sheet, safe-area padding, keyboard tabs and focus styles. Screenshots and layout checks at 390 and 1440 pixels; no real-device certification.
- **States:** LOADING / SUCCESS / EMPTY / ERROR, explicit retry and recovery. Backend failures do not become false empty results.
- **Continuation fixes:** Enter now applies the filter sheet, Escape discards unapplied changes, Lyanneurs filters preserve Request-only urgency/budget, and canonical auth-state changes refresh discovery and own-profile actions without a page reload. Avatar failures use the existing neutral fallback.
- **Request wizard honesty:** the unsupported photo step is skipped in both directions, with five visible numbered steps. The existing Requests schema has no persisted media field and its old upload bucket is absent; the old path silently discarded photos while reporting success. The API now rejects nonempty Request media rather than returning unpersisted media in its success object. No media schema or bucket was added. The date choice is labelled “Date à convenir ensemble”, consistent with its persisted urgency-only value.

## Files changed for this feature

Application: `results.html`, `explorer-ui.js` (new), `explorer.css` (new), `explorer-repository.js`, `feed.html`, `bokantaj-repository.js`, `api-client.js`, `script.js`, `profile-repository.js`, `ai-classifier.js`, `app-router.js`, `shared-html-build.js`.

Validation: `playwright.config.js`, `tests/e2e/explorer_discovery.spec.js` (new), `tests/e2e/explorer_persistence.spec.js` (new), `tests/e2e/helpers/approved-backend.js` (new), `tests/e2e/interaction_coverage.spec.js`, `tests/momentic/03_explorer_lyanneurs.test.yaml`, `scripts/explorer-architecture-audit.js`, `scripts/bokantaj-architecture-audit.js`, `scripts/runtime-ownership-audit.js`, this report.

Obsolete uncommitted anonymous-policy draft removed; no replacement migration.

Generated evidence: `artifacts/explorer/`. `.momentic-mcp/` contains tool artifacts. Test runner output and `.codex/config.toml` tool configuration changes are not application changes.

## Database / RLS

No remote migration, data cleanup, Auth configuration or RLS change was applied.

Confirmed blocker: anonymous `requests` SELECT returns HTTP 401 / PostgreSQL `42501`, permission denied for `is_current_user_admin`. The existing PUBLIC visibility policy is assigned to `public` and references a helper only executable by authenticated/service roles.

The rejected draft was **never applied**: read-only remote migration history did not contain version `20260917193948`, and the proposed `Anonymous public requests discovery` policy was absent. The obsolete uncommitted file was removed. Existing authenticated RLS and function grants remain unchanged. Direct anonymous raw Requests access still fails; Explorer no longer uses that path.

### Public server projection (Option C)

`GET /v1/explorer/requests`, registered in the existing Express app and served through the existing Vercel `/v1/*` gateway. It uses the existing server-only Supabase service client with a fixed query, not caller-supplied SQL/select/filters. Missing service credentials fail closed with HTTP 503. It never forwards database errors or serializes raw rows.

Exact predicate: `visibility = 'PUBLIC' AND status = 'OPEN' AND safety_status = 'SAFE' AND target_user_id IS NULL AND classification_status IN ('CLASSIFIED', 'UNCLASSIFIED')`. This conservatively withholds assigned/completed/cancelled requests, targeted rows, every non-SAFE or unknown safety state, and review-pending/unknown classification. No new business status is introduced. SAFE is an existing persisted signal, not a new guarantee of human moderation.

Response envelope: `{ requests, nextOffset }`. Each Request has exactly `id, category, taxonomy_id, title, description, budget, location, urgency, created_at, requester`. `requester` has exactly `display_name, avatar_url`; name is first name plus surname initial, never full profile or requester UUID. Internal classification/safety/target fields are used only server-side to constrain eligibility and never returned. The independent recursive-key contract test fails on ANY added response field, including unanticipated future columns.

Location is unstructured text. Public discovery returns only one recognized territory from a fixed allowlist, otherwise null (including ambiguous multiple territories). It never returns street, commune, coordinates, postcode-only guesses, or raw location. Consequently anonymous area search has territory-level precision. Request title/description are existing PUBLIC authored content; this projection does not detect personal information authors may themselves have included in those fields. No location schema redesign or content moderation system was added.

Each page contains at most 100 records ordered by recency/id; the browser follows `nextOffset`. Only a nonnegative integer offset is accepted. Unknown query keys are rejected, responses use `Cache-Control: no-store`. Pagination is live, not a transactional snapshot. The existing gateway/deployment controls remain responsible for rate limiting.

Anonymous Explorer maps this projection to its existing card/detail model, with OPEN implied by the eligibility predicate. Details/deep links reuse the same projected record rather than issuing raw anonymous Requests reads. The help action invokes the canonical login gate. After authentication, discovery reloads the existing secure Request records and transactional actions retain their existing owner; no requester resolution is duplicated in the public endpoint/frontend.

Storage policy inspection confirms that `bokantaj-media` already allows authenticated inserts only inside the caller's user-ID folder. No storage policy was changed.

## Playwright / regression evidence

Seventeen new read journeys exercise persisted Requests, real profiles/services and profile details, common taxonomy and matching-service display, both empty states, injected HTTP 503 errors with real-backend retry recovery, community-only feed, mobile and desktop layout/keyboard/filter controls. They additionally cover filter-sheet Enter/Escape, mode-specific filter preservation, in-place real login/logout, the full Request wizard through review/back navigation without publication, own-Request detail/actions, and territory label format differences. Successful data responses are not mocked. The error tests intentionally inject failures.

Six write journeys are explicitly guarded and **not certified**: Request publication/separation, community publication, profile→contact/message persistence, Request→help/correct conversation context, favorite persistence, and Request→proposal→mission. The Request help assertion in the old interaction test moved from Bokantaj to Explorer and now requires both visible recipient/context and persisted invitation relationships.

The existing mocked messaging/date-proposal regression executes unchanged. It proves its mocked UI contract only, not real conversation or mission persistence. Existing business-boundary tests are likewise not a substitute for the gated business journeys.

Commands executed:

- `npm run audit:architecture`: PASS after final application changes.
- `npm run build:mobile`: PASS; 174 root assets and byte-identical shared Capacitor bundles. This is a build check, not an iPhone runtime test.
- JavaScript syntax checks and `git diff --check`: PASS at inspection.
- `npx playwright test`: pre-Option-C full run **42 passed, 6 skipped, 0 failed (53.5 seconds)**. Full suite executed repeatedly. An initial stale feed-help assertion was corrected to the new architecture. A later unexpected sidebar HTTP 400 was reproduced, traced to an invalid schema query and fixed at its source. The continuation first reproduced all three keyboard/filter/auth defects before fixing them. Final run log: `artifacts/explorer/playwright-full.log`.

Console/network: strict monitoring on the real-data discovery journeys; explicit 503 tests are intentional. Anonymous Explorer no longer issues the failing raw Requests read; its public endpoint is covered by strict browser network monitoring. Do not interpret legacy tests that filter console messages as proof of globally error-free runtime.

One intermediate continuation run recorded `ERR_BLOCKED_BY_ORB` for an existing Google-hosted avatar; a direct header check subsequently returned 200/image/jpeg and the final strict run passed without excluding this error. The avatar provider failure was intermittent; its exact cause is unproven. A neutral avatar fallback is used on load failure; no profile record or remote avatar URL was changed.

## Momentic

Focused existing Explorer campaign updated and attempted after deterministic discovery passed. No writes were authorized in the campaign.

- Initial server connection refusal: **ENVIRONMENT**, local server started.
- First running campaign: **ENVIRONMENT**, browser `Page.captureScreenshot` timed out after the initial assertion.
- One reset/retry progressed through service search, profile and area-filter exploration, then the MCP session disappeared before a final result could be collected: **ENVIRONMENT / incomplete**.
- Continuation MCP attempt likewise lost its session before collection: **ENVIRONMENT**. Host inspection showed competing UAD/Dropbox/Chrome activity, but this does not establish the timeout's cause. No unrelated processes were stopped.
- The same saved test then ran with the installed CLI, outside the short-lived MCP session: **PASS, 1 test / 5 steps, 182 seconds**, run ID `f334c8cf-34d3-4fc0-920b-b8196bc241c7`. Command: `npx momentic run tests/momentic/03_explorer_lyanneurs.test.yaml --env local --timeout-minutes 8 --output-dir artifacts/explorer/momentic-cli`.
- The uncached exploratory action verified Jardinage search, the real matching profile and its services, filter-sheet area entry, an empty result and recovery after removing that area. The remaining steps verified an unknown-service empty state. No login or business write was performed.
- **TEST DEFECT:** despite the functional PASS, its console artifact contains 22 error records (some grouped repeats) for `data:image/svg+xml;TRUNCATED` / `ERR_INVALID_URL`. The exact URL construction exists in the installed Momentic `processElementAttributes` snapshot serializer (`node_modules/momentic/bin/cli.js`), not in application source. All error records in that artifact have this signature. No production code or vendor files were modified to hide it. The independent strict Playwright run passed without excluding it.
- **EXPECTED STATE:** no-result messages for `CommuneIntrouvable` and `XYZ999UNKNOWN`.
- **REAL DEFECT:** no additional application defect confirmed by the completed Momentic campaign.

Durable evidence: `artifacts/explorer/momentic-cli.log`, `artifacts/explorer/momentic-cli/progress.json`, and the run ZIP under its `runs/` directory. Results were not uploaded to the hosted dashboard.

## Required completion environment

Provide an approved non-production Supabase project/build and two existing test accounts. The write guard requires `LYANN_E2E_ALLOW_WRITES=1`, `LYANN_E2E_WRITE_PROJECT_REF`, `LYANN_E2E_REQUESTER_EMAIL/PASSWORD`, `LYANN_E2E_HELPER_EMAIL/PASSWORD`, and optionally `LYANN_E2E_BASE_URL`. It rejects the currently configured production project. The staging frontend itself must point at the approved project; the guard does not override its backend or fabricate data.

Read-only environment discovery during the continuation found no V1 development branches. A separate project named LYANN-V2 is visible, but its use as V1 staging has not been authorized and it was not modified.

Do not apply the rejected draft policy. On approved staging, execute all six write journeys and check private Request isolation. The read-only Momentic campaign is now complete; repeat it on the approved target if its configuration differs. New staging fixtures are retained for investigation; no destructive cleanup is performed automatically.

VERCEL PREVIEW: not generated.

WEB HUMAN: WAITING FOR YOANN.

IPHONE RUNTIME: NOT TESTED.

MAIN: UNTOUCHED. PRODUCTION: UNTOUCHED (no business-data mutation/deployment). MERGE: NO.


## Option C validation (current working tree)

Additional files: `api/public-explorer-requests.js`, `api/server.js`, `tests/e2e/explorer_public_contract.spec.js`; integration changes in `explorer-repository.js`, `explorer-ui.js`, `script.js`, and authenticated assertion in `tests/e2e/explorer_discovery.spec.js`.

Nine new permanent Playwright tests exercise isolated HTTP contract/security cases plus real anonymous HTTP and browser discovery. Negative private/unsafe/extra-column fixtures are isolated test inputs, never database writes or runtime results. An intermediate run caught malformed pending-help context from the public detail path; that path now uses the canonical login gate without storing incomplete requester metadata. The assertion was retained. Full-suite result is recorded below after the final run. No Momentic rerun is needed for this fixed HTTP contract; its previous serializer defect remains unrelated.

Final Option C run: **51 passed, 6 skipped, 0 failed (58.3 seconds)**, Chromium, `LYANN_E2E_BASE_URL=http://127.0.0.1:8097 npx playwright test`. Evidence: `artifacts/explorer/playwright-public-projection-final.log`. All nine new tests passed. Existing authenticated discovery retains requester identity; its real detail, own-Request behavior and taxonomy tests pass. Strict anonymous discovery telemetry recorded no unexpected console errors or failed HTTP/network requests. Backend 503 cases are deliberate test injections.

`npm run audit:architecture`, `npm run build:mobile`, JavaScript syntax checks, and `git diff --check`: PASS after final application changes. No real iPhone runtime or production deployment was tested. The existing mocked help/date-proposal test passed; the six staging-only persistent journeys remain skipped, so real help→conversation→proposal→mission persistence is **not certified**. No test was weakened to hide a failure.

RLS MODIFIED: NO. REMOTE DATABASE MODIFIED: NO. REJECTED MIGRATION APPLIED: NO. COMMIT: NO. DEPLOY: NO. MAIN: UNTOUCHED. PRODUCTION: UNTOUCHED. MERGE: NO.


## Release candidate preparation

The implementation-review SHA and no-commit status above record the earlier review stage. Release-candidate preparation is authorized on `architecture-stabilization` only; the Git commit itself identifies the final candidate. Production configuration and remote Supabase remain unchanged.

Read-only authenticated discovery tests now require `LYANN_E2E_QA_A_EMAIL`, `LYANN_E2E_QA_A_PASSWORD`, `LYANN_E2E_QA_B_EMAIL`, and `LYANN_E2E_QA_B_PASSWORD` from the runner environment. No QA credentials are included in the new tests. Missing credentials fail explicitly rather than silently skipping authenticated coverage. The six persistence journeys retain their separate approved-staging guard.

`npm test` delegates to the existing architecture audit, matching the existing Architecture Stability workflow. `npm run test:integration` runs the complete Playwright suite; `npm run build:mobile` checks the shared artifact. Final validation runs against the staged candidate without further source edits before committing. Local captures/logs, `.momentic-mcp`, Supabase CLI cache, `.codex/config.toml`, environment files and generated bundles are excluded from the commit.
