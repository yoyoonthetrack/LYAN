(() => {
  'use strict';

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

  function loadScriptOnce(src, dataAttr) {
    if (document.querySelector(`script[${dataAttr}]`)) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute(dataAttr, 'true');
    document.head.appendChild(script);
  }

  function loadOwnerActions() {
    loadScriptOnce('owner-actions.js?v=20260911-1', 'data-lyann-owner-actions');
  }

  function loadSharedUxFixes() {
    loadScriptOnce('shared-ux-fixes.js?v=20260911-2', 'data-lyann-shared-ux');
  }

  function removeKnownDemoSections(root = document) {
    root.querySelectorAll('.talents-section, .testimonials-section').forEach((section) => {
      const text = section.textContent || '';
      if (DEMO_MARKERS.some((marker) => text.includes(marker))) section.remove();
    });
  }

  function removeKnownDemoCards(root = document) {
    root.querySelectorAll('img').forEach((img) => {
      const src = (img.getAttribute('src') || '').toLowerCase();
      const alt = img.getAttribute('alt') || '';
      const isDemo = DEMO_IMAGE_PARTS.some((part) => src.includes(part)) || DEMO_MARKERS.some((marker) => alt.includes(marker));
      if (!isDemo) return;
      const card = img.closest(SAFE_CARD_SELECTORS);
      if (card) card.remove(); else img.remove();
    });
    root.querySelectorAll('[data-member-id="200"], [data-member-id="201"], [data-member-id="212"]').forEach((el) => el.remove());
  }

  function neutralizeHardcodedCounters(root = document) {
    root.querySelectorAll('.photo-category-sub').forEach((el) => {
      const text = (el.textContent || '').trim();
      if (/\b\d+\s+(artisans?|passionn[eé]s?|[ée]lectriciens?|plombiers?|accompagnateurs?)\b/i.test(text)) {
        el.textContent = 'Explorer cette activité';
      }
    });
  }

  function sanitizeTextNodes(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, noscript, textarea')) return;
      let value = node.nodeValue || '';
      const original = value;
      value = value
        .replace(/Coup de pouce/g, 'Service de confiance')
        .replace(/coup de pouce/g, 'service de confiance')
        .replace(/\s*\(Simul[ée]\)/gi, '')
        .replace(/Bonjour David\b/g, 'Bonjour');
      if (value !== original) node.nodeValue = value;
    });
  }

  function hideResidualDemoBlocks(root = document) {
    const candidates = root.querySelectorAll('body *');
    candidates.forEach((el) => {
      if (el.children.length > 8) return;
      const text = (el.textContent || '').trim();
      if (!text) return;
      const marker = DEMO_MARKERS.find((m) => text.includes(m));
      if (!marker || marker === 'Bonjour David') return;
      const safeContainer = el.closest(SAFE_CARD_SELECTORS);
      if (safeContainer) { safeContainer.remove(); return; }
      if (marker === 'Zone de Test') {
        const block = el.closest('section, fieldset, details, [class*="test"], [class*="demo"]');
        if (block) block.remove();
      }
    });
  }

  function runHygiene(root = document) {
    removeKnownDemoSections(root);
    removeKnownDemoCards(root);
    neutralizeHardcodedCounters(root);
    sanitizeTextNodes(root);
    hideResidualDemoBlocks(root);
  }

  function start() {
    runHygiene(document);
    loadOwnerActions();
    loadSharedUxFixes();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) runHygiene(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => runHygiene(document), { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
