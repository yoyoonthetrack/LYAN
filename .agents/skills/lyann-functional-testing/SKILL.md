---
name: lyann-functional-testing
description: >
  Runtime functional testing methodology for LYANN V1.
  Use when auditing buttons, links, forms, navigation, menus,
  modals, user journeys, Playwright tests, regressions,
  interaction coverage, JavaScript errors, network failures,
  or verifying whether a LYANN feature actually works.
---

# LYANN Functional Testing

## Purpose

Verify real behavior, not visual presence or static wiring.

Never declare an interaction WORKING merely because:
- the element exists;
- a selector exists;
- onclick exists;
- href exists;
- a function name exists;
- a listener appears in source code.

Runtime evidence is required.

## Validation statuses

Use:

- RUNTIME VERIFIED
- STATICALLY WIRED
- NOT RUNTIME VERIFIED
- BROKEN
- TRUE NOT IMPLEMENTED
- HUMAN REQUIRED
- ENVIRONMENT REQUIRED
- BLOCKED

Never call STATICALLY WIRED "working".

## Runtime validation

For every safely automatable interaction:

ELEMENT
→ USER ACTION
→ HANDLER
→ REAL CONSEQUENCE
→ ASSERTION

Navigation:

CLICK
→ URL/STATE CHANGE
→ DESTINATION RENDERED
→ NO CRITICAL ERROR

Modal/menu:

CLICK
→ OPEN
→ CONTENT AVAILABLE
→ INTERNAL ACTIONS
→ CLOSE

Form:

INPUT
→ VALIDATION
→ SUBMIT
→ REAL RESULT

Persistent action:

ACTION
→ BACKEND SUCCESS
→ UI UPDATE
→ RELOAD
→ DATA STILL PRESENT

## Playwright

Playwright must interact with the rendered application like a user.

Do not count element existence as functional validation.

Capture:
- pageerror
- console.error
- unhandled failures
- critical request failures
- HTTP 4xx/5xx relevant to tested functionality
- navigation failures

A test may validate multiple interactions, but report:

PLAYWRIGHT TEST COUNT

and separately:

ACTUAL INTERACTIONS EXECUTED

## State exploration

Do not test only initial DOM state.

Explore:

PAGE
→ MENU
→ MODAL
→ TAB
→ DROPDOWN
→ SECONDARY STATE
→ NEW INTERACTIONS

Discover newly visible interactions recursively and safely.

## Business journeys

Prefer complete journeys over isolated clicks.

Important LYANN journeys include:

Auth → Profile

Explorer → Search → Results → Lyanneur profile

Besoin d'un coup de main → Request → Publication

Bokantaj → available interactions

Messaging → Conversation → Message → Persistence

Request → Proposal → Revision → Acceptance → Milestones/Mission

Subscription/payment → safe test boundary

## No fake success

Never:
- weaken assertions;
- remove failing tests to obtain PASS;
- mock the feature being validated;
- invent runtime UUIDs;
- invent users;
- suppress errors;
- report unexecuted tests as PASS.

If not tested:
NOT TESTED.

If environment prevents validation:
ENVIRONMENT REQUIRED.

## Root-cause fixing

When multiple failures share a cause, fix the shared cause.

Do not patch each button independently when navigation,
event lifecycle, routing, auth, rendering or state management
is the real cause.

## Reporting

Always distinguish:

TOTAL INTERACTION INSTANCES
UNIQUE INTERACTION BEHAVIORS
RUNTIME VERIFIED
STATICALLY WIRED
NOT RUNTIME VERIFIED
BROKEN
HUMAN REQUIRED
ENVIRONMENT REQUIRED

Never claim ALL BUTTONS WORK without evidence.
