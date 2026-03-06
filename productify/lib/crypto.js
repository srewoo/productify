/**
 * Productify — crypto.js
 * AES-256-GCM API key encryption using Web Crypto API
 */

const Crypto = {
  /** Derive or retrieve the app's encryption key from chrome.storage */
  async _getKey() {
    let { cryptoKeyRaw } = await chrome.storage.local.get('cryptoKeyRaw');
    if (!cryptoKeyRaw) {
      // Generate a fresh 256-bit key on first use
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      cryptoKeyRaw = Array.from(new Uint8Array(await window.crypto.subtle.exportKey('raw', key)));
      await chrome.storage.local.set({ cryptoKeyRaw });
    }
    return window.crypto.subtle.importKey(
      'raw',
      new Uint8Array(cryptoKeyRaw),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /** Encrypt a plaintext string → base64 ciphertext */
  async encrypt(plaintext) {
    if (!plaintext) return '';
    const key = await this._getKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    // Prepend iv to ciphertext for storage
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  },

  /** Decrypt base64 ciphertext → plaintext string */
  async decrypt(ciphertext64) {
    if (!ciphertext64) return '';
    try {
      const key = await this._getKey();
      const combined = new Uint8Array(atob(ciphertext64).split('').map(c => c.charCodeAt(0)));
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error('[Productify] Decryption failed:', e);
      return '';
    }
  },

  /** Store an API key encrypted */
  async storeKey(name, value) {
    const encrypted = await this.encrypt(value);
    const keys = await Storage.getEncryptedKeys();
    await Storage.setEncryptedKeys({ ...keys, [name]: encrypted });
  },

  /** Retrieve and decrypt an API key */
  async retrieveKey(name) {
    const keys = await Storage.getEncryptedKeys();
    return this.decrypt(keys[name] || '');
  },

  /** Store all API keys at once */
  async storeAllKeys(keyMap) {
    const encrypted = {};
    for (const [name, value] of Object.entries(keyMap)) {
      if (value) encrypted[name] = await this.encrypt(value);
    }
    const existing = await Storage.getEncryptedKeys();
    await Storage.setEncryptedKeys({ ...existing, ...encrypted });
  },

  /** Retrieve all keys decrypted */
  async retrieveAllKeys() {
    const keys = await Storage.getEncryptedKeys();
    const result = {};
    for (const [name, encrypted] of Object.entries(keys)) {
      result[name] = await this.decrypt(encrypted);
    }
    return result;
  }
};

if (typeof window !== 'undefined') window.Crypto = Crypto;
