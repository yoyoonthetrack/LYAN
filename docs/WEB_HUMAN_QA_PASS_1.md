# WEB HUMAN QA PASS #1

Baseline: `fc936da1db3673766a2a523b8f71b62bef8fe309` on `architecture-stabilization`.

The canonical interaction gate is documented in [AUTH_INTERACTION_GATE.md](AUTH_INTERACTION_GATE.md). Public discovery and reading stay anonymous; protected interactions preserve their context through the existing authentication surface. No automatic contractual submission is introduced.

## Explorer and Activity

Explorer discovery requires `visibility = PUBLIC AND status = OPEN AND safety_status = SAFE AND target_user_id IS NULL AND classification_status IN (CLASSIFIED, UNCLASSIFIED)`. The anonymous server endpoint already applied this predicate; authenticated discovery now applies the same predicate through its existing RLS-protected query. The browser also rejects non-OPEN results, irrespective of legacy status query parameters. The status selector and chip are removed. The public HTTP projection and forbidden-field contract are unchanged.

`OPEN` is the actionable Request state in schema.sql and the invitation/proposal/acceptance procedures. No status transitions, records, RLS policies or remote schema are changed. Activity continues selecting every Request owned by the current user without filtering its status. Its existing badge helper presents OPEN/ACTIVE/PUBLISHED in green; ASSIGNED, COMPLETED/CLOSED, CANCELLED, other inactive or unknown states in red, with text labels. Runtime validation exposed obsolete Activity reads; missions now use their canonical helper_id participant and sent proposals read quotes by provider_id instead of the nonexistent offers table. This changes reads only.

## Geography and presentation

Lyanneurs exposes Territoire and Commune as native selects in the existing responsive filter dialog. The four territories and their dependent communes reuse the existing profile completion dataset by reference; no second dataset is added. An incompatible commune is cleared on territory change. Applying, cancelling, removing, switching modes and reloading retain the appropriate filters. Existing geographic URLs and saved profile location can initialize these selectors when the canonical dataset resolves them unambiguously. Geographic source coverage remains that of the existing profile dataset.

The Explorer introduction is centered. The two discovery modes use a prominent segmented selector with 60px touch targets, distinct selected state, focus indication and the existing arrow/Home/End keyboard behavior. No other page is redesigned.

## Validation scope

Permanent tests cover public status discovery and legacy URL bypass, all four dependent territory lists, mobile/desktop filtering and cancellation/reload, keyboard selection, centered introduction, and real authenticated Activity history reads. Isolated status contracts use in-memory records only, never fabricated runtime database content. Existing Auth Gate, public endpoint security, discovery, Bokantaj and messaging regressions remain in the full suite. Write/persistence journeys retain the existing staging-only guard and cannot certify production persistence.

No production deployment, Supabase remote modification, main modification or merge is authorized. Release is a branch commit and Vercel Preview only. Human Web validation remains with Yoann; real iPhone runtime is not tested.

Final validation (2026-09-18): targeted P1/P2 **6 passed**; complete Playwright **77 passed, 8 skipped, 0 failed**. The eight skips preserve staging/write boundaries and are not persistence certification. Architecture/release audits (`npm test`), security workflow assertions, API and generated mobile core syntax checks, shared build (`npm run build:mobile`, 174 byte-identical assets) and `git diff --check` passed. New browser tests found no unexpected console or network errors in the final run. Screenshots at 390px and 1440px were inspected. No new runtime fixture data was introduced.
