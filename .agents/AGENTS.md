# AGENTS.md — Workspace Rules for LYANN

## CROSS-PLATFORM LYANN RULE — MANDATORY

LYANN Web and the Capacitor mobile application share the same product and functional source of truth.

Every functional fix, business-logic fix, data-source fix, security fix and applicable UI/component fix MUST be implemented in the shared code path and validated on BOTH:
- **WEB**: `https://lyann.app`
- **MOBILE**: Capacitor iOS generated bundle

Do NOT create separate Web and App implementations unless a platform-specific behavior is genuinely required.

Allowed platform-specific differences are limited to things such as:
- Responsive dimensions / layout
- Safe areas
- Native keyboard behavior
- Native navigation / header when intentional
- Capacitor plugins
- Deep links
- OS-specific integrations

Business logic and authoritative data sources must remain shared.

Every future report must include:
```text
WEB REGRESSION: PASS / FAIL / NOT TESTED
IOS BUNDLE REGRESSION: PASS / FAIL / NOT TESTED
SHARED IMPLEMENTATION: YES / NO
PLATFORM-SPECIFIC CODE ADDED: NONE / [explain why]
```

A fix is not considered complete if only one platform has been updated when the behavior applies to both.

Any shared functional modification must be regression-tested on both Web and iOS. A feature is globally PASS only when both platforms PASS.

