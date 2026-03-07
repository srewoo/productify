/**
 * Briefly — contentScript.js
 * Runs on every page. Extracts rich context from the active tab.
 * Listens for messages from the service worker requesting context.
 */

(function () {
  'use strict';

  /**
   * Extract all 10 context signals from the current page.
   * Returns a structured context object.
   */
  function extractPageContext() {
    const ctx = {
      pageTitle: document.title || '',
      url: window.location.href,
      domain: window.location.hostname,
      pageType: detectPageType(),
      selectedText: getSelectedText(),
      visibleText: getVisibleText(),
      codeBlocks: getCodeBlocks(),
      headings: getHeadings(),
      structuredData: getStructuredData(),
      formFields: getFormContext(),
      imageAltTexts: getImageAlts(),
      domainContext: getDomainContext(),
      extractedAt: Date.now()
    };
    return ctx;
  }

  /** P0: Get user's text selection */
  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    return selection.toString().trim().slice(0, 2000);
  }

  /** P0: Get visible page text (truncated to 4000 chars) */
  function getVisibleText() {
    // Get meaningful text, skip scripts/styles/nav
    const cloned = document.body.cloneNode(true);
    ['script', 'style', 'noscript', 'head', 'nav', 'footer', '[aria-hidden="true"]'].forEach(sel => {
      cloned.querySelectorAll(sel).forEach(el => el.remove());
    });
    const text = cloned.innerText || cloned.textContent || '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  }

  /** P0: Collect code blocks with language detection */
  function getCodeBlocks() {
    const blocks = [];
    document.querySelectorAll('pre, code').forEach(el => {
      const text = el.innerText || el.textContent || '';
      if (text.trim().length < 10) return;
      const lang = detectCodeLanguage(el);
      blocks.push({ lang, code: text.trim().slice(0, 800) });
    });
    return blocks.slice(0, 5); // Cap at 5 code blocks
  }

  /** P0: Get heading hierarchy */
  function getHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => ({ level: parseInt(h.tagName[1]), text: h.innerText?.trim() || '' }))
      .filter(h => h.text.length > 0)
      .slice(0, 15);
  }

  /** P0: Detect page type from domain + URL patterns */
  function detectPageType() {
    const url = window.location.href;
    const host = window.location.hostname;
    if (host.includes('github.com')) {
      if (url.includes('/pull/')) return 'github-pr';
      if (url.includes('/issues/')) return 'github-issue';
      if (url.includes('/blob/')) return 'github-code';
      return 'github';
    }
    if (host.includes('jira') || host.includes('atlassian.net')) return 'jira-ticket';
    if (host.includes('confluence') || url.includes('/wiki/')) return 'confluence-doc';
    if (host.includes('notion.so') || host.includes('notion.site')) return 'notion-page';
    if (host.includes('linear.app')) return 'linear-issue';
    if (host.includes('slack.com')) return 'slack';
    if (host.includes('arxiv.org')) return 'research-paper';
    if (url.includes('docs.') || url.split('/').some(p => p === 'docs')) return 'documentation';
    if (document.querySelector('article, .article, .post, .blog-post')) return 'article';
    if (document.querySelector('pre, code')) return 'technical';
    return 'general';
  }

  /** P1: Extract JSON-LD, Open Graph, and table structured data */
  function getStructuredData() {
    const result = {};
    // JSON-LD
    try {
      const jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (jsonLd) result.jsonLd = JSON.parse(jsonLd.textContent);
    } catch (_) {}
    // Open Graph
    const og = {};
    document.querySelectorAll('meta[property^="og:"]').forEach(m => {
      og[m.getAttribute('property')] = m.getAttribute('content');
    });
    if (Object.keys(og).length) result.openGraph = og;
    // Table data (first table only)
    const table = document.querySelector('table');
    if (table) {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText?.trim());
      const rows = Array.from(table.querySelectorAll('tr')).slice(1, 6)
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText?.trim()));
      if (headers.length) result.table = { headers, rows };
    }
    return result;
  }

  /** P1: Collect form context for drafting/filling intents */
  function getFormContext() {
    const fields = [];
    document.querySelectorAll('form input, form textarea, form select, [contenteditable]').forEach(el => {
      const label = el.labels?.[0]?.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || '';
      const value = el.value || el.innerText || '';
      if (label || value) {
        fields.push({
          label: label.trim().slice(0, 80),
          value: value.trim().slice(0, 200),
          type: el.tagName.toLowerCase()
        });
      }
    });
    return fields.slice(0, 10);
  }

  /** P1: Get image alt texts */
  function getImageAlts() {
    return Array.from(document.querySelectorAll('img[alt]'))
      .map(img => img.getAttribute('alt').trim())
      .filter(alt => alt.length > 2)
      .slice(0, 10);
  }

  /** P1: Domain context — known tool detection */
  function getDomainContext() {
    const host = window.location.hostname;
    const KNOWN_TOOLS = {
      'github.com': 'GitHub',
      'jira.': 'Jira',
      'atlassian.net': 'Jira/Confluence',
      'notion.so': 'Notion',
      'notion.site': 'Notion',
      'linear.app': 'Linear',
      'slack.com': 'Slack',
      'confluence': 'Confluence',
      'figma.com': 'Figma',
      'docs.google.com': 'Google Docs',
      'stackoverflow.com': 'Stack Overflow',
      'mdn': 'MDN Docs'
    };
    for (const [domain, name] of Object.entries(KNOWN_TOOLS)) {
      if (host.includes(domain)) return { tool: name, domain: host };
    }
    return { tool: null, domain: host };
  }

  /** Naive code language detection from element classes */
  function detectCodeLanguage(el) {
    const cls = (el.className + ' ' + (el.querySelector('code')?.className || '')).toLowerCase();
    const langs = ['javascript', 'python', 'java', 'typescript', 'rust', 'go', 'bash', 'shell',
      'sql', 'html', 'css', 'yaml', 'json', 'ruby', 'php', 'cpp', 'c', 'swift'];
    for (const lang of langs) {
      if (cls.includes(lang) || cls.includes('lang-' + lang) || cls.includes('language-' + lang)) {
        return lang;
      }
    }
    return 'unknown';
  }

  // ──────────────────────────────────────────────────────
  // Message listener — responds to service worker requests
  // ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_CONTEXT') {
      try {
        const context = extractPageContext();
        sendResponse({ success: true, context });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true; // Keep channel open for async
    }

    if (msg.type === 'GET_SELECTION') {
      sendResponse({ selectedText: getSelectedText() });
      return true;
    }
  });
})();
