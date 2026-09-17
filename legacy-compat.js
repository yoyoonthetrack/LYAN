// LYANN temporary legacy compatibility quarantine.
// This file may bridge old global entry points to canonical owners, but it must
// never contain business logic or a second data source.
(function () {
  'use strict';

  const LEGACY_STORAGE_KEYS = [
    'lyann_mock_chat_msgs',
    'lyann_mock_conversations',
    'lyann_demo_chat_msgs'
  ];

  function purgeLegacyFixtures() {
    try {
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
  }

  function installBridges() {
    // Historical dashboard alerts were backed by mock localStorage chat data.
    // Until a real notification repository owns them, returning no synthetic
    // actions is safer than mixing fake state with Supabase conversations.
    window.getPendingActions = function getPendingActionsCanonicalBridge() {
      return [];
    };

    // Generic navigation compatibility always ends in the canonical router.
    window.openLyannMessages = function openLyannMessagesCanonicalBridge() {
      if (window.LYANN_ROUTER) return window.LYANN_ROUTER.go('messages');
      if (window.LYANN_MESSAGING) return window.LYANN_MESSAGING.openList();
      return false;
    };
  }

  function boot() {
    purgeLegacyFixtures();
    installBridges();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.LYANN_LEGACY_COMPAT = Object.freeze({
    purgeLegacyFixtures,
    installBridges,
    storageKeys: [...LEGACY_STORAGE_KEYS]
  });
})();
