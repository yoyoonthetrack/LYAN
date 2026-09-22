(() => {
  'use strict';

  // Temporary defense-in-depth only. Source/build sanitization is authoritative.
  // Deliberately one-shot: no MutationObserver is allowed to mutate live product UI.
  const DEMO_MARKERS = [
    'Jocelyn Cabort',
    'Hugues Zami',
    'Wilfrid Rapon',
    'David.M',
    'Tati Huguette',
    'Zone de Test',
    'Bonjour David'
  ];

  const DEMO_IMAGE_PARTS = [
    'jocelyn-cabort.png',
    'hugues-zami.png',
    'wilfrid-rapon.png',
    'david-34.png',
    'huguette-68.png'
  ];

  const SAFE_CARD_SELECTORS = [
    '.talent-card',
    '.testimonial-slide',
    '.feed-card',
    '.bokantaj-card',
    '.activity-card',
    '.demo-card',
    '.test-card',
    '[data-demo]',
    '[data-test-fixture]',
    'article'
  ].join(',');

  function removeKnownDemoSections() {
    // Homepage talents and testimonials stay: they are the same content as the website.
  }

  function removeKnownDemoCards(root = document) {
    root.querySelectorAll('[data-demo], [data-test-fixture]').forEach((el) => el.remove());
  }

  function neutralizeHardcodedCounters() {
    // Keep the same category labels as the website.
  }

  function sanitizeTextNodes(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, noscript, textarea')) return;
      const original = node.nodeValue || '';
      const value = original
        .replace(/Coup de pouce/g, 'Service de confiance')
        .replace(/coup de pouce/g, 'service de confiance')
        .replace(/\s*\(Simul[ée]\)/gi, '')
        .replace(/Bonjour David\b/g, 'Bonjour');
      if (value !== original) node.nodeValue = value;
    });
  }

  function runHygiene(root = document) {
    removeKnownDemoSections(root);
    removeKnownDemoCards(root);
    neutralizeHardcodedCounters(root);
    sanitizeTextNodes(root);
  }

  function start() {
    runHygiene(document);
    // One second pass after deferred scripts have initialized. No ongoing observer.
    window.addEventListener('load', () => runHygiene(document), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
