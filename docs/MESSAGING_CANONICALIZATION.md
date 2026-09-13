# Canonical LYANN messaging

LYANN now has one public messaging controller: `messaging-ui.js`.

All Web and Capacitor messaging entry points must terminate in `window.LYANN_MESSAGING`.

The only supported UI state sequence is:

1. conversation list
2. selected conversation
3. optional child workflow (proposal, milestone, tracking, payment, proof, date, review)

Legacy entry functions remain only as compatibility aliases and must forward to the canonical controller. Child workflows replace the conversation body and must never visually overlap mission context or the composer.
