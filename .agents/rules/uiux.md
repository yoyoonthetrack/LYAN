---
trigger: always_on
---

# LYANN — UI / UX MASTER RULE

LYANN must always feel simple, obvious, fast and reassuring.

The user should understand:
- where they are;
- what they can do;
- what happens next;
- whether their action succeeded;
without needing instructions.

UX clarity has priority over visual complexity.

## 1. USER-FIRST DESIGN

Always design from the user's task, not from the database or technical architecture.

Before creating or modifying an interface, ask internally:

1. What is the user trying to accomplish?
2. What is the shortest understandable path?
3. What information is actually necessary now?
4. What can be postponed, inferred or hidden?
5. What could confuse or block the user?

Remove unnecessary friction.

Never expose backend complexity through the UI.


## 2. MINIMUM EFFORT

Minimize:
- clicks;
- taps;
- typing;
- repeated information;
- unnecessary screens;
- unnecessary confirmations;
- cognitive load.

Never ask twice for information LYANN already knows.

Pre-fill known information when safe.

Use sensible defaults when they represent a genuine product default, never fabricated personal data.

For long processes, divide the task into short logical steps.


## 3. ONE CLEAR PRIMARY ACTION

Every screen should have an obvious primary purpose.

The main CTA must be visually identifiable.

Avoid several competing primary buttons.

Use hierarchy:

PRIMARY = main next action
SECONDARY = useful alternative
TERTIARY = optional action
DESTRUCTIVE = clearly separated

Do not overload screens with actions.


## 4. PROGRESSIVE DISCLOSURE

Do not show everything at once.

Show essential information first.

Reveal advanced options only when relevant.

Complex functionality should feel simple without removing necessary capabilities.

Prefer:
simple first -> details on demand.


## 5. NAVIGATION

Navigation must be predictable and consistent.

Users should always understand:
- current location;
- how to go back;
- how to reach major sections;
- what happens when they tap an item.

Do not create multiple navigation patterns for the same purpose.

Preserve LYANN's main navigation structure unless explicitly asked to redesign it.

Never create dead ends.

Back navigation must preserve reasonable context and user input.


## 6. CONSISTENCY

The same action should look and behave the same everywhere.

Reuse established:
- buttons;
- cards;
- inputs;
- spacing;
- typography;
- icons;
- modals;
- sheets;
- menus;
- loading states;
- empty states;
- error states.

Do not invent a new UI pattern when an existing LYANN pattern already solves the problem.


## 7. FORMS

Forms must be as short as reasonably possible.

Only request information necessary for the current task.

Use:
- clear labels;
- useful placeholders when needed;
- correct keyboard/input types;
- appropriate autocomplete;
- sensible defaults;
- inline validation.

Do not erase valid user input after an error.

Validation messages must explain what needs correction.

Do not wait until final submission to reveal obvious field errors.

Avoid giant forms when a guided flow is easier.


## 8. MOBILE FIRST

Assume many LYANN users operate primarily from a phone.

Every important action must work comfortably with one hand where practical.

Respect:
- safe areas;
- mobile keyboard;
- scrolling;
- touch targets;
- bottom navigation;
- sticky actions when useful;
- readable text sizes.

Never allow the keyboard to hide the active input or important CTA.

Avoid tiny controls and closely packed actions.


## 9. RESPONSIVE DESIGN

Interfaces must adapt naturally rather than merely shrink.

Test:
- small mobile;
- large mobile;
- tablet when relevant;
- desktop Web.

Avoid horizontal scrolling except when intentional.

Content hierarchy must remain understandable at every size.


## 10. FEEDBACK FOR EVERY ACTION

Never leave the user wondering whether something happened.

Important actions must provide immediate feedback.

Use appropriate:
- pressed state;
- loading state;
- success confirmation;
- error feedback;
- updated content.

Prevent accidental duplicate submissions while an operation is processing.

Do not show a success state before the backend operation actually succeeds.


## 11. LOADING

Loading must feel intentional.

Prefer contextual skeletons or local loading indicators when appropriate.

Avoid blocking the entire interface for small background operations.

Never show indefinite loading without handling timeout/error conditions.

Do not cause unnecessary layout jumps when content arrives.


## 12. EMPTY STATES

Empty screens must explain the situation and, when useful, provide the next action.

Good:
"Aucune demande publiée pour le moment."
+ "Publier une demande"

Bad:
blank screen.

Never fill empty states with fake runtime content.


## 13. ERRORS

Errors must be understandable by normal users.

Do not expose raw:
- SQL errors;
- UUID errors;
- stack traces;
- HTTP internals;
- developer terminology.

User-facing message:
what happened + what the user can do.

Technical details may be logged separately for debugging.

Never blame the user for a system failure.


## 14. CONFIRMATIONS

Do not ask for confirmation for harmless reversible actions.

Require confirmation for meaningful destructive or irreversible actions.

Confirmation dialogs must clearly name what will happen.

Avoid generic:
"Are you sure?"

Prefer:
"Supprimer cette annonce ?"


## 15. DESTRUCTIVE ACTIONS

Destructive actions must never visually compete with the main positive action.

Clearly distinguish deletion/cancellation when consequences matter.

Provide undo when technically and logically appropriate.

Never place destructive controls where accidental taps are likely.


## 16. TEXT & MICROCOPY

Use short, natural, human language.

Prefer user vocabulary over technical vocabulary.

Avoid unnecessary explanations.

Buttons should describe actions:

Good:
"Publier ma demande"
"Envoyer le message"
"Proposer un devis"

Avoid vague labels:
"OK"
"Continuer"
"Valider"

when a more precise action label is possible.

Preserve LYANN terminology consistently.


## 17. VISUAL HIERARCHY

Users should understand the screen by scanning it.

Use hierarchy through:
- spacing;
- typography;
- grouping;
- size;
- emphasis.

Do not solve hierarchy by adding excessive borders, boxes, colors or decoration.

Important content first.
Secondary information quieter.


## 18. INFORMATION DENSITY

Do not overcrowd cards and screens.

Prioritize information needed for the immediate decision.

Move secondary details into:
- detail screens;
- expandable areas;
- sheets/modals when appropriate.

Avoid displaying database fields simply because they exist.


## 19. ACCESSIBILITY

Target WCAG 2.2 AA where applicable.

Maintain:
- sufficient contrast;
- readable typography;
- accessible labels;
- keyboard support on Web;
- visible focus;
- semantic controls;
- adequate touch targets.

Do not rely solely on color to communicate meaning.

Accessibility is part of UX, not a later optional pass.


## 20. ICONS

Use familiar icons.

Do not use ambiguous icons without labels when meaning is not obvious.

Keep icon meaning consistent throughout LYANN.

Do not use decorative icons excessively.


## 21. SEARCH & DISCOVERY

Search should tolerate normal human behavior.

Where relevant:
- handle accents/case reasonably;
- provide useful filters;
- preserve selected filters;
- make clearing filters easy;
- clearly distinguish no results from loading/error.

Do not overwhelm users with filters before they need them.


## 22. LYANN DUAL ROLE

A user can request help AND provide help.

The interface must not unnecessarily force users into permanent "client" or "provider" identities.

Context should determine the role.

Make it obvious when the user is:
- publishing a request;
- responding as a Lyanneur;
- discussing a request;
- sending/proposing a quote.


## 23. IMPORTANT FLOWS

For critical journeys such as:

signup,
onboarding,
publishing a request,
finding a Lyanneur,
messaging,
proposal/quote,
mission,
payment,

optimize the COMPLETE journey, not individual screens in isolation.

Avoid unnecessary back-and-forth between screens.

Preserve entered information when navigating backwards whenever reasonable.


## 24. UX REGRESSION RULE

Before modifying an existing interaction, determine why it currently exists.

Do not remove useful behavior simply to make the UI cleaner.

After meaningful UI/UX changes verify:
- primary CTA;
- back navigation;
- forms;
- keyboard;
- loading;
- error;
- empty state;
- mobile layout;
- desktop layout;
- accessibility basics.

Functional correctness must not regress because of visual improvements.


## 25. DO NOT REDESIGN WITHOUT NEED

When asked to fix functionality, preserve the existing visual language.

Improve obvious UX problems encountered during the task when safe, but do not transform every task into a redesign.

Large visual/interaction changes require explicit design scope.


## 26. UX SELF-REVIEW

Before considering a screen complete, perform a UX review:

- Is the purpose immediately understandable?
- Is the main action obvious?
- Can anything unnecessary be removed?
- Is anything being asked twice?
- Are labels understandable?
- Is feedback immediate?
- Are errors useful?
- Is the empty state useful?
- Does mobile work comfortably?
- Does the keyboard behave correctly?
- Can the user get stuck?
- Is there a simpler path?

Fix obvious issues before declaring the screen complete.


## 27. GOLDEN UX RULE

Do not make the user think about how LYANN works.

Make LYANN adapt to what the user is trying to accomplish.

Simple does not mean fewer capabilities.

Simple means the right capability appears at the right moment.