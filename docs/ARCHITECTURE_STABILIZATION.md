# LYANN Architecture Stabilization

Baseline: `a02891c22b05dc29578c7fcbc91de6c942de7032` (production snapshot from 2026-09-11 around 05:00 Europe/Paris).

## Goal

Stabilize the existing product without a big-bang rewrite. Production stays on the known baseline while changes are developed and validated on this branch.

## Non-negotiable rules

1. Web and Capacitor keep the same functional source of truth.
2. No runtime hotfix may silently replace a core implementation.
3. No fake user/profile/review/payment state may render before real data arrives.
4. Session is resolved once and exposed through one shared session store.
5. UI-only actions (open filter, menu, modal, sheet, tab) must not wait for Supabase/network.
6. Feature code must not use global MutationObservers as a substitute for explicit lifecycle/events.
7. Stripe and other heavy feature engines load only when their feature is entered.
8. Every core flow gets an automated regression test before production merge.

## Target architecture

```text
src/
  core/
    bootstrap.js
    session.js
    events.js
    cache.js
    supabase.js
  features/
    auth/
    bokantaj/
    explorer/
    profile/
    messaging/
    requests/
    missions/
    payments/
    account/
  ui/
    modal.js
    sheet.js
    skeleton.js
    avatar.js
```

The migration is incremental. Existing pages continue to work while features are moved one by one.

## Stabilization sequence

### Phase 1 — Structural correctness

- Validate HTML structure on all product pages.
- Fix invalid modal/sheet nesting before changing behavior.
- Remove runtime demo sanitization from the critical rendering path by cleaning source data/templates.
- Move scripts to deterministic loading and remove ordering assumptions.
- Establish one app bootstrap and one `APP_READY` lifecycle.

### Phase 2 — Session and data lifecycle

- Resolve Supabase session once.
- Expose user/session through a shared store.
- Replace placeholder-first rendering with skeleton/empty states.
- Add in-memory cache for profiles and frequently reused entities.
- Deduplicate repeated profile/session fetches.

### Phase 3 — Feature boundaries

Extract progressively from `script.js` and `feed.html`:

- Bokantaj
- Profile
- Explorer
- Messaging
- Requests
- Missions/quotes/milestones
- Account/settings
- Payments/subscriptions

### Phase 4 — Lazy loading

- Stripe only when payment flow starts.
- Chat only when messaging opens.
- Account/profile detail only when opened.
- Verification/subscription/dispute engines only on relevant surfaces.

### Phase 5 — Database performance

Verify with `EXPLAIN (ANALYZE, BUFFERS)` before adding indexes. Candidate indexes from the audit:

- `requests(status, created_at DESC)`
- `requests(requester_id, created_at DESC)`
- `bokantaj_posts(created_at DESC)`
- `bokantaj_posts(author_id, created_at DESC)`
- `messages(conversation_id, created_at)`
- `conversation_participants(user_id, conversation_id)`

### Phase 6 — Regression gates

Web core flows:

- login/logout/session restore
- Bokantaj load/filter/profile opening
- Explorer/search/profile/contact
- publish a need
- messaging send/receive
- quote lifecycle
- mission/milestone lifecycle
- account/profile update

Capacitor core flows are validated against the same shared implementation before merge.

## Performance targets

- UI-only click feedback: < 100 ms
- interactive shell: < 2 s on normal broadband
- no visible placeholder-to-real-data swaps
- profile/chat open from warm cache: < 150 ms
- no duplicate network request for the same profile during one interaction

## First known structural defect

`feed.html` contains `bokantajFilterSheetModal` before `lyannDetailModal` is structurally closed. That makes the filter sheet a descendant of a hidden modal in browser DOM recovery. This must be corrected at source, not patched with CSS/JS.

## Merge policy

Do not merge this branch to `main` until:

```text
WEB REGRESSION: PASS
IOS BUNDLE REGRESSION: PASS
SHARED IMPLEMENTATION: YES
PLATFORM-SPECIFIC CODE ADDED: NONE (unless explicitly justified)
```
