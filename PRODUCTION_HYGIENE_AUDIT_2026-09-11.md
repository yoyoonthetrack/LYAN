# LYANN — Production hygiene audit — 2026-09-11

## Status
FAIL — production public HTML still contains historical/demo/static content. This is separate from the financial security hardening, which remains deployed.

## Confirmed on live `https://lyann.app`
The live HTML currently exposes static/demo-looking identities and claims, including:
- Jocelyn Cabort
- Hugues Zami
- Wilfrid Rapon
- David.M
- Tati Huguette Cazeau
- dashboard greeting `Bonjour David`
- `Zone de Test` / local-data reset UI
- `Photo / Vidéo de preuve (Simulé)`
- old wording such as `Coup de pouce de confiance` and multiple `Demander de l'aide` / `besoin d'aide` strings
- hard-coded marketplace availability counts such as 48 artisans, 62 passionnés, 35 électriciens, 29 plombiers, 54 accompagnateurs
- hard-coded testimonials tied to the static identities

## Source confirmation
`index.html` on `main` contains the static talent cards directly, including Jocelyn Cabort, Hugues Zami and Wilfrid Rapon, with numeric demo member IDs. Therefore this is not merely stale search-engine indexing.

## Product risks
- users can mistake fabricated/static identities, testimonials and availability counts for real marketplace data;
- production exposes test/simulation wording;
- product terminology has drifted from the current LYANN vocabulary;
- static talent cards can bypass the real Supabase-backed discovery model.

## Required cleanup
1. Remove all static/demo identity cards and testimonials from production UI.
2. Replace public talent/community sections with real Supabase-backed content or honest empty states; never fabricate fallback people/counts/reviews.
3. Remove production `Zone de Test`, simulated-proof wording and demo reset controls.
4. Remove hard-coded availability counts unless computed from authoritative production data.
5. Normalize old help/coup-de-pouce wording to current LYANN terminology without rewriting user-generated content.
6. Audit all production-visible HTML/JS for demo fixtures, mock fallbacks and static identities.
7. Keep explicit dev/test fixtures only behind an unmistakable non-production guard.
8. Validate Web + iOS after cleanup before release PASS.

## Release rule
Do not delete real Supabase users/posts/requests by heuristic. This cleanup concerns source/UI fixtures and must not mass-delete production user data.
