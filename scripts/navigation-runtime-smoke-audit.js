const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildHtml } = require('../shared-html-build');

const root = path.resolve(__dirname, '..');
const routerSource = fs.readFileSync(path.join(root, 'app-router.js'), 'utf8');
const sourceHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const failures = [];
const fail = (message) => failures.push(message);
const assert = (condition, message) => { if (!condition) fail(message); };

const listeners = new Map();
const navigations = [];
const calls = {
  account: [],
  messagesList: 0,
  conversations: [],
  drawerClosed: 0,
  login: 0
};

const bodyClassList = {
  contains(name) { return name === 'user-is-logged-in'; }
};

const document = {
  readyState: 'loading',
  body: { classList: bodyClassList, style: {} },
  addEventListener(type, handler) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(handler);
  },
  getElementById() { return null; },
  querySelector() { return null; }
};

let authenticated = true;
const window = {
  addEventListener() {},
  dispatchEvent() {},
  LYANN_AUTH_STATE: { isAuthenticated: () => authenticated, getSnapshot: () => ({status:'ready', authenticated}) },
  location: {
    href: 'https://lyann.app/index.html',
    pathname: '/index.html',
    search: '',
    assign(target) { navigations.push(target); }
  },
  closeLyannHamburgerDrawer() { calls.drawerClosed += 1; },
  openLoginModal() { calls.login += 1; },
  openAccountModalSubView(section) { calls.account.push(section); },
  LYANN_MESSAGING: {
    openList() { calls.messagesList += 1; return true; },
    openConversation(payload) { calls.conversations.push(payload); return true; }
  }
};
window.window = window;

const context = {
  window,
  document,
  CustomEvent: class { constructor(type, options) { this.type=type; this.detail=options?.detail; } },
  URL,
  URLSearchParams,
  console,
  setTimeout,
  clearTimeout
};

try {
  vm.runInNewContext(routerSource, context, { filename: 'app-router.js' });
} catch (error) {
  fail(`app-router.js must execute in the smoke harness: ${error.message}`);
}

const clickListeners = listeners.get('click') || [];
assert(clickListeners.length === 1, 'router must install exactly one capture click listener immediately, before DOMContentLoaded');
assert(window.LYANN_ROUTER?.__canonical === true, 'canonical router must be available immediately');

function fakeElement(attributes = {}) {
  return {
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; }
  };
}

function eventFor({ explicit = null, selector = null } = {}) {
  const event = {
    prevented: false,
    propagationStopped: false,
    immediateStopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  };
  event.target = {
    closest(query) {
      if (query === '[data-lyann-route]') return explicit;
      if (selector && query === selector) return fakeElement();
      return null;
    }
  };
  return event;
}

function click(options) {
  const handler = clickListeners[0];
  if (!handler) return null;
  const event = eventFor(options);
  handler(event);
  return event;
}

click({ explicit: fakeElement({ 'data-lyann-route': 'account' }) });
click({ explicit: fakeElement({ 'data-lyann-route': 'activity' }) });
click({ explicit: fakeElement({ 'data-lyann-route': 'settings' }) });
click({ explicit: fakeElement({ 'data-lyann-route': 'favorites' }) });
click({ explicit: fakeElement({ 'data-lyann-route': 'finances' }) });

assert(
  JSON.stringify(calls.account) === JSON.stringify(['account', 'activity', 'settings', 'favorites', 'finances']),
  'drawer account/activity/settings/favorites/finances routes must dispatch to their account sections'
);

const legacyAccountSelector = '.open-account-modal-trigger, .nav-profile-btn';
click({ selector: legacyAccountSelector });
assert(calls.account[calls.account.length - 1] === 'account', 'real Web account/profile triggers must route to account');

const messageSelector = '#tab-messages, [data-lyann-messages], .open-chat-trigger';
click({ selector: messageSelector });
click({ selector: messageSelector });
assert(calls.messagesList === 2, 'bottom-nav/header message triggers must open the messaging list');

click({
  explicit: fakeElement({
    'data-lyann-route': 'messages',
    'data-contact-id': 'contact-123',
    'data-contact-name': 'Contact Test'
  })
});
assert(calls.conversations.length === 1, 'explicit contact/message CTA must open a conversation');
assert(calls.conversations[0]?.contactId === 'contact-123', 'message CTA must forward the contact id');

click({ selector: '#tab-explorer' });
assert(navigations.includes('results.html'), 'Explorer must remain routable through the canonical router');

// Verify a logged-out protected route produces a visible login action instead of a silent no-op.
authenticated = false;
document.body.classList.contains = () => false;
click({ explicit: fakeElement({ 'data-lyann-route': 'settings' }) });
click({ selector: messageSelector });
assert(calls.login >= 2, 'protected Web routes must open login when the preview/session is unauthenticated');

const builtHtml = buildHtml(sourceHtml);
const positions = {
  surfaces: builtHtml.indexOf('src="surface-manager.js'),
  router: builtHtml.indexOf('src="app-router.js'),
  appShell: builtHtml.indexOf('src="app-shell.js'),
  messagingUi: builtHtml.indexOf('src="messaging-ui.js'),
  legacyScript: builtHtml.indexOf('src="script.js')
};

assert(positions.surfaces >= 0, 'built HTML must include surface-manager.js');
assert(positions.router >= 0, 'built HTML must include app-router.js');
assert(positions.surfaces < positions.router, 'surface manager must load before the application router');
assert(positions.router < positions.appShell, 'application router must load before app-shell.js');
assert(positions.router < positions.messagingUi, 'application router must load before messaging-ui.js');
assert(positions.router < positions.legacyScript, 'application router must load before legacy script.js');
assert(sourceHtml.includes('open-account-modal-trigger'), 'source HTML must expose the real legacy account trigger covered by the router smoke test');
assert(sourceHtml.includes('open-chat-trigger'), 'source HTML must expose the real Web messaging trigger covered by the router smoke test');

const runtimeBlock = builtHtml.slice(positions.surfaces, positions.appShell);
assert(!runtimeBlock.includes('defer'), 'critical shared runtime scripts must execute deterministically, without defer');

for (const file of ['surface-manager.js', 'app-router.js', 'safety-repository.js', 'legacy-compat.js']) {
  const count = builtHtml.split(file).length - 1;
  assert(count === 1, `${file} must appear exactly once in the built HTML`);
}

if (failures.length) {
  console.error('NAVIGATION RUNTIME SMOKE: FAIL');
  failures.forEach((message) => console.error(`  ✖ ${message}`));
  process.exit(1);
}

console.log('NAVIGATION RUNTIME SMOKE: PASS');
console.log('Real Web account/profile triggers, protected-route auth fallback, drawer, messaging, contact and Explorer navigation are covered.');
