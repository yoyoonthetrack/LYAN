---
name: lyann-ui-ux
description: >
  LYANN-specific UI and UX methodology. Use when creating,
  modifying or reviewing screens, forms, navigation, mobile
  layouts, user journeys, interaction feedback, accessibility,
  responsive behavior or product microcopy.
---

# LYANN UI / UX

## Principle

LYANN must feel:

simple
obvious
fast
reassuring
human

UX clarity is more important than visual complexity.

A user should quickly understand:

WHERE AM I?

WHAT CAN I DO?

WHAT HAPPENS NEXT?

DID IT WORK?

## User effort

Minimize:
- taps;
- clicks;
- typing;
- repetition;
- screens;
- unnecessary confirmations;
- cognitive load.

Do not ask twice for information already known.

Prefill safe known information when appropriate.

## Primary action

Every important screen should have a clear primary action.

Use hierarchy:

PRIMARY
SECONDARY
TERTIARY
DESTRUCTIVE

Avoid multiple competing primary CTAs.

## Progressive disclosure

Show what is necessary now.

Reveal advanced information only when relevant.

Do not expose backend complexity to users.

## Navigation

Navigation must be predictable.

Users should understand:
- current location;
- how to go back;
- major sections;
- result of navigation.

Avoid dead ends.

Back navigation should preserve useful context and user input.

## Consistency

Reuse established LYANN patterns for:

buttons
cards
inputs
spacing
typography
icons
modals
sheets
menus
loading
empty states
errors

Do not create a new interaction pattern without a reason.

## Forms

Forms should be as short as reasonably possible.

Use:
- clear labels;
- correct input types;
- useful autocomplete;
- inline validation;
- actionable errors;
- safe defaults.

Preserve valid user input after errors.

Prefer guided flows over giant forms when complexity requires steps.

## Mobile first

LYANN must work comfortably on phones.

Verify:
- safe areas;
- keyboard behavior;
- scrolling;
- touch targets;
- bottom navigation;
- sticky actions;
- readable text.

The keyboard must never hide the active field or critical CTA.

## Responsive

Support:
- small mobile;
- large mobile;
- tablet;
- desktop.

Responsive design means adapting layout, not simply shrinking it.

Avoid unintended horizontal scrolling.

## Feedback

Every meaningful action requires immediate feedback:

PRESSED
LOADING
SUCCESS
ERROR
UPDATED CONTENT

Prevent duplicate submissions.

Never show success before backend success.

## Loading

Use contextual loading indicators.

Do not unnecessarily block the whole application.

Avoid indefinite loading and major layout jumps.

## Empty states

Empty states must explain:
- what is empty;
- why when useful;
- what the user can do next.

Never fill an empty production state with fake content.

## Errors

Use normal human language.

Do not expose:
- SQL;
- UUID internals;
- stack traces;
- raw HTTP internals;
- developer terminology.

Explain what happened and what the user can do next.

## Destructive actions

Do not visually compete with normal actions.

Require confirmation only when meaningful.

Use specific confirmation language.

Use undo when appropriate.

## Microcopy

Use short, natural, precise LYANN vocabulary.

Prefer:

"Publier ma demande"

"Envoyer le message"

"Proposer un devis"

over vague labels such as:

"OK"
"Continuer"
"Valider"

when a more precise action label is available.

## LYANN dual role

A LYANN user can be both:

requester
and
Lyanneur.

Do not force a permanent Client/Provider identity split.

Context determines the role.

The current role/action must remain obvious.

## Accessibility

Target WCAG 2.2 AA where applicable.

Verify:
- contrast;
- readable text;
- semantic controls;
- labels;
- keyboard navigation;
- visible focus;
- touch targets.

Do not communicate meaning by color alone.

## UX regression

Before changing existing UI:
understand its current behavior.

After changing it, verify:

CTA
navigation
back behavior
forms
keyboard
loading
success
error
empty state
mobile
desktop
accessibility

Never improve appearance by breaking functionality.

## Design scope

During functional stabilization:
do not redesign LYANN unnecessarily.

Safe local UX improvements are allowed.

Large visual or navigation changes require explicit design scope.

## Golden rule

Do not make users think about how LYANN works.

LYANN should adapt to the user's task and reveal the right
capability at the right moment.
