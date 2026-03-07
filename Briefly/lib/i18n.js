/**
 * Briefly — i18n.js
 * Internationalization helpers (wraps chrome.i18n)
 */

const I18n = {
  /** Get a localized string by key */
  get(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  },

  /** Get the current UI locale */
  getLocale() {
    return chrome.i18n.getUILanguage();
  },

  /** Format a relative time string (e.g., "2 min ago") */
  relativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  },

  /** Format bytes to human-readable */
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
};

if (typeof window !== 'undefined') window.I18n = I18n;
