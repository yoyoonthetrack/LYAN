# LYANN Architecture V2 — Foundation

## Goal

LYANN is one product with one functional frontend and two presentation targets:

1. Web (Vercel)
2. Capacitor (iOS/Android)

The targets may differ in responsive layout, safe areas and native integrations, but they must not diverge in product logic, data ownership, routing semantics or user state.

## Non-negotiable principles

### 1. One domain, one owner
Each domain exposes one public API/controller and one authoritative repository/service. Historical implementations can exist only as private compatibility adapters during migration.

### 2. One data truth
When Supabase is available, production UI must not silently fall back to local mock/demo state. Loading/error states are explicit.

### 3. One route/surface state
Opening a feature changes application state; it does not stack unrelated historical modals. Parent/child relationships are deterministic.

### 4. One shared build transformation
Web rendering and Capacitor packaging use `shared-html-build.js`. The mobile bundles consume byte-identical copies of `www` after the shared build.

### 5. No placeholder-first production rendering
Production screens render loading/skeleton states, then authoritative data. Static fake users, fake counters and fake conversations are forbidden.

## Target domains

| Domain | Canonical owner | Data owner | Notes |
|---|---|---|---|
| Session/Auth | `session-store.js` / `auth-state.js` | Supabase Auth | One lifecycle for all pages |
| App shell/navigation | shared shell/router | URL + app state | Same semantic destinations Web/mobile |
| Messaging | `messaging-ui.js` | `messaging-repository.js` | Single list/conversation surface |
| Profiles | profile surface | `profile-repository.js` | One public profile path |
| Bokantaj | Bokantaj controller | `bokantaj-repository.js` | No demo-first feed |
| Explorer | Explorer controller | `explorer-repository.js` | Shared filters/results state |
| Requests | request service | Supabase requests | Publication + detail + targeting |
| Missions | mission service | Supabase missions | Conversation context links to mission/request |
| Quotes/Milestones | quote service | Supabase quotes/milestones | One workflow, shared Web/mobile |
| Payments | payment service/API | Stripe/Supabase | No local financial truth |
| Notifications | notification service | server/Supabase/native | Platform delivery may differ |

## Migration order

1. **Build/runtime parity** — eliminate independent Web/mobile transforms.
2. **Navigation/surface ownership** — introduce one canonical route/surface state and retire competing modal openers.
3. **Session/bootstrap** — ensure every page waits on the same session truth and never paints fake authenticated content.
4. **Messaging** — complete removal of legacy public chat/list ownership and local production fallbacks.
5. **Requests → missions → quotes/milestones** — unify context IDs and remove button-specific routing hacks.
6. **Profiles / Explorer / Bokantaj** — ensure one repository and one renderer/controller per domain.
7. **Payments / assurance / transactional state** — make every visible status derive from authoritative backend state.
8. **UX simplification** — remove redundant buttons, duplicate close/back controls and unnecessary nested overlays.
9. **Full journey gates** — automate critical paths and validate Web + generated iOS bundle before merge.

## Critical product journeys to gate

- Logged-out → sign in → authenticated shell
- Home → Explorer → profile → contact
- Bokantaj → Lyann detail → Je peux aider → same canonical conversation
- Bottom Messages → existing conversation list → same conversation
- Conversation → Voir le Lyann / mission → back to same conversation
- Conversation → direct quote → accept/reject/counter
- Conversation → milestone quote → percentage/amount allocation → validation
- Accepted quote → mission → milestone/proof/client validation
- Publish Lyann → feed/detail → edit/close/delete permissions
- Profile → portfolio/services/reviews/favorites
- All critical surfaces: loading, empty, error, offline/retry, close/back

## Definition of done for stabilization

The stabilization branch is mergeable only when:

- no competing public owner exists for any migrated domain;
- architecture/security/production-hygiene gates pass;
- the shared build parity gate passes;
- Web critical-path UAT passes;
- generated iOS bundle critical-path UAT passes;
- no known placeholder/demo production data is visible;
- no known user-facing button is unbound or routed to a legacy implementation.
