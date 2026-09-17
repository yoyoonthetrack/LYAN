# AGENTS.md — Workspace Rules for LYANN

## CROSS-PLATFORM LYANN RULE — MANDATORY

LYANN Web and the Capacitor mobile application share the same product and functional source of truth.

Every functional fix, business-logic fix, data-source fix, security fix and applicable UI/component fix MUST be implemented in the shared code path and validated on BOTH:
- **WEB**: Vercel preview / `https://lyann.app` once merged
- **MOBILE**: Capacitor iOS generated bundle

Do NOT create separate Web and App implementations unless a platform-specific behavior is genuinely required.

Allowed platform-specific differences are limited to:
- Responsive dimensions / layout
- Safe areas
- Native keyboard behavior
- Native navigation / header when intentional
- Capacitor plugins
- Deep links
- OS-specific integrations

Business logic and authoritative data sources must remain shared.

## SINGLE OWNER RULE — MANDATORY

Each product domain must have one authoritative owner. Do not create a second implementation to patch the first.

Canonical ownership targets:
- Auth/session: shared session/auth modules only
- Navigation/surfaces: one shared navigation/surface controller
- Messaging: `window.LYANN_MESSAGING` + `LYANN_MESSAGING_REPOSITORY`
- Profiles: profile repository + one profile surface
- Bokantaj: Bokantaj repository + one renderer/controller
- Explorer: explorer repository + one renderer/controller
- Requests/missions/quotes/milestones: shared domain services, never local mock state when Supabase is active
- Payments: shared payment service/API only

Legacy code may temporarily remain as a private compatibility adapter, but it MUST NOT expose a competing public entry point or independently control navigation/UI state.

## SHARED ARTIFACT RULE — MANDATORY

Web and Capacitor must pass through the same shared HTML transformation/build code. iOS and Android assets must be byte-identical copies of the generated `www` artifact. Do not add platform-specific HTML/JS mutation to `build_mobile.js`.

Production cleanup must be implemented in source or the shared build layer, never independently in Web and mobile pipelines.

## UX / ROUTING CONTRACT

- Every visible action must have exactly one destination/handler.
- No user-facing button may depend on an obsolete global function when a canonical controller exists.
- Opening a child surface must hide/replace its parent surface instead of visually stacking competing modules.
- Loading, empty, error and authenticated states must represent real authoritative data.
- Do not show placeholder/demo content first and replace it later with production data.
- Mobile back/close and Web close/back must return to the same logical parent state.

## VALIDATION

Every future report must include:
```text
WEB REGRESSION: PASS / FAIL / NOT TESTED
IOS BUNDLE REGRESSION: PASS / FAIL / NOT TESTED
SHARED IMPLEMENTATION: YES / NO
PLATFORM-SPECIFIC CODE ADDED: NONE / [explain why]
```

A fix is not considered complete if only one platform has been updated when the behavior applies to both.
A feature is globally PASS only when both Web and iOS pass.

Architecture/security/hygiene gates are necessary but do not replace real product-path UAT.
