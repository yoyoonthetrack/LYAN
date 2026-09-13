# Canonical LYANN messaging

LYANN now has one public messaging controller: `messaging-ui.js`.

All Web and Capacitor messaging entry points must terminate in `window.LYANN_MESSAGING`.

The only supported UI state sequence is:

1. conversation list
2. selected conversation
3. optional child workflow (proposal, milestone, tracking, payment, proof, date, review)

Legacy entry functions remain only as compatibility aliases and must forward to the canonical controller. The previous public conversation opener has been demoted to a private chat-core implementation, and `app-shell.js` no longer owns an independent messaging state machine. Child workflows replace the conversation body and must never visually overlap mission context or the composer.

On native iOS, the canonical messaging shell must reserve the status-bar / Dynamic Island zone even when WKWebView reports a zero CSS safe-area inset, and the app bottom tab bar must be hidden while messaging is open.
