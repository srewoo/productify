/**
 * Productify — service_worker.js (MV3 Service Worker)
 * Central message router, API orchestration, offscreen management, and keyboard shortcuts.
 *
 * NOTE: manifest.json has "type": "module" so this is an ES module service worker.
 * Side-effect imports below load intentClassifier and outputRouter into `self.*`.
 */

// Side-effect imports — these files set self.IntentClassifier / self.OutputRouter
import './intentClassifier.js';
import './outputRouter.js';

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────
const BACKEND_URL_KEY = 'settings';
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

let pendingAudioResolve = null;
let currentTabId = null;
let lastOutput = null;
let lastContext = null;
let lastTranscript = null;

// ─────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    // Open onboarding on first install
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
  // Set default settings
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) {
    await chrome.storage.local.set({
      settings: {
        sttProvider: 'whisper',
        language: 'auto',
        tone: 'auto',
        outputFormat: 'markdown',
        backendUrl: 'http://localhost:3000',
        theme: 'dark'
      }
    });
  }
});

// Open side panel when action clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
  currentTabId = tab.id;
});

// ─────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command, tab) => {
  switch (command) {
    case 'push-to-talk':
      broadcastToPanel({ type: 'SHORTCUT_PUSH_TO_TALK' });
      break;
    case 'copy-last-output':
      broadcastToPanel({ type: 'SHORTCUT_COPY' });
      break;
    case 'toggle-history':
      broadcastToPanel({ type: 'SHORTCUT_HISTORY' });
      break;
    case 'retry-last':
      broadcastToPanel({ type: 'SHORTCUT_RETRY' });
      break;
  }
});

// ─────────────────────────────────────────────────────────────────
// MAIN MESSAGE ROUTER
// ─────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender, sendResponse);
  return true; // Keep channel open for async
});

async function handleMessage(msg, sender, sendResponse) {
  try {
    switch (msg.type) {
      // ── RECORDING ──
      case 'START_RECORDING': {
        await ensureOffscreen();
        await chrome.runtime.sendMessage({ type: 'START_RECORDING', config: msg.config });
        sendResponse({ success: true });
        break;
      }
      case 'STOP_RECORDING': {
        await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
        sendResponse({ success: true });
        break;
      }
      case 'CANCEL_RECORDING': {
        await chrome.runtime.sendMessage({ type: 'CANCEL_RECORDING' });
        sendResponse({ success: true });
        break;
      }

      // ── FROM OFFSCREEN ──
      case 'RECORDING_STARTED':
        broadcastToPanel({ type: 'RECORDING_STARTED' });
        break;
      case 'RECORDING_CANCELLED':
        broadcastToPanel({ type: 'RECORDING_CANCELLED' });
        break;
      case 'AUDIO_TOO_SHORT':
        broadcastToPanel({ type: 'ERROR', error: 'empty_transcript', message: "Didn't catch that" });
        break;
      case 'RECORDING_ERROR':
        broadcastToPanel({ type: 'ERROR', error: msg.error, message: msg.message });
        break;
      case 'WAVEFORM_DATA':
        broadcastToPanel({ type: 'WAVEFORM_DATA', data: msg.data });
        break;
      case 'AUDIO_READY': {
        broadcastToPanel({ type: 'STATE_TRANSCRIBING' });
        try {
          const transcript = await transcribeAudio(msg.audioData, msg.mimeType);
          lastTranscript = transcript;
          broadcastToPanel({ type: 'TRANSCRIPT_READY', transcript });
          // Get page context
          const context = await getPageContext();
          lastContext = context;
          // Local intent pre-classification
          const localIntent = self.IntentClassifier?.classify(transcript) || { primary_intent: 'custom', confidence: 0.5 };
          broadcastToPanel({ type: 'INTENT_LOCAL', intent: localIntent });
          // Full generation
          await processTranscript({ transcript, context, localIntent });
        } catch (err) {
          broadcastToPanel({ type: 'ERROR', error: 'api_error', message: err.message });
        }
        break;
      }

      // ── PROCESS / REFINE ──
      case 'PROCESS_TEXT': {
        broadcastToPanel({ type: 'STATE_GENERATING' });
        try {
          const context = await getPageContext();
          lastContext = context;
          await processTranscript({ transcript: msg.text, context, localIntent: null, overrideIntent: msg.intent });
        } catch (err) {
          broadcastToPanel({ type: 'ERROR', error: 'api_error', message: err.message });
        }
        break;
      }
      case 'REFINE_OUTPUT': {
        broadcastToPanel({ type: 'STATE_GENERATING' });
        try {
          await refineOutput({ refinement: msg.refinement, previousOutput: lastOutput, context: lastContext, transcript: lastTranscript });
        } catch (err) {
          broadcastToPanel({ type: 'ERROR', error: 'api_error', message: err.message });
        }
        break;
      }

      // ── INTEGRATIONS ──
      case 'ROUTE_OUTPUT': {
        broadcastToPanel({ type: 'STATE_ROUTING', target: msg.target });
        try {
          const result = await self.OutputRouter.route(msg.target, lastOutput, lastContext, currentTabId);
          broadcastToPanel({ type: 'ROUTE_SUCCESS', result, target: msg.target });
          sendResponse({ success: true, result });
        } catch (err) {
          broadcastToPanel({ type: 'ERROR', error: 'integration_error', message: err.message });
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      // ── SETTINGS ──
      case 'SAVE_SETTINGS': {
        await chrome.storage.local.set({ settings: msg.settings });
        sendResponse({ success: true });
        break;
      }
      case 'GET_SETTINGS': {
        const { settings } = await chrome.storage.local.get('settings');
        sendResponse({ success: true, settings });
        break;
      }
      case 'STORE_KEYS': {
        // Encrypt and store API keys
        await encryptAndStoreKeys(msg.keys);
        sendResponse({ success: true });
        break;
      }

      // ── CONTEXT ──
      case 'GET_PAGE_CONTEXT': {
        const context = await getPageContext();
        sendResponse({ success: true, context });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    console.error('[Productify SW] Error:', err);
    sendResponse({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────
// API FUNCTIONS
// ─────────────────────────────────────────────────────────────────
async function getBackendUrl() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return settings.backendUrl || 'http://localhost:3000';
}

async function getDecryptedKey(name) {
  const { encryptedKeys = {}, cryptoKeyRaw } = await chrome.storage.local.get(['encryptedKeys', 'cryptoKeyRaw']);
  const encrypted = encryptedKeys[name];
  if (!encrypted || !cryptoKeyRaw) return '';
  try {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(cryptoKeyRaw), { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = new Uint8Array(atob(encrypted).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(dec);
  } catch { return ''; }
}

async function transcribeAudio(audioDataUrl, mimeType) {
  const backendUrl = await getBackendUrl();
  const { settings = {} } = await chrome.storage.local.get('settings');
  
  // Convert data URL to blob
  const base64 = audioDataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const audioBlob = new Blob([bytes], { type: mimeType });

  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('provider', settings.sttProvider || 'whisper');
  formData.append('language', settings.language || 'auto');

  const openaiKey = await getDecryptedKey('openai');
  const googleKey = await getDecryptedKey('googleStt');
  const elevenKey = await getDecryptedKey('elevenStt');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${backendUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'x-openai-key': openaiKey,
        'x-google-stt-key': googleKey,
        'x-elevenlabs-key': elevenKey
      },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Transcription failed: ${res.status}`);
    }
    const data = await res.json();
    return data.transcript || '';
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Transcription timed out. Try again.');
    throw err;
  }
}

async function processTranscript({ transcript, context, localIntent, overrideIntent }) {
  const backendUrl = await getBackendUrl();
  const { settings = {} } = await chrome.storage.local.get('settings');
  const openaiKey = await getDecryptedKey('openai');

  const payload = {
    transcript,
    context: {
      pageTitle: context?.pageTitle || '',
      url: context?.url || '',
      selectedText: context?.selectedText || '',
      visibleText: context?.visibleText || '',
      codeBlocks: context?.codeBlocks || [],
      headings: context?.headings || [],
      domainContext: context?.domainContext || {},
      pageType: context?.pageType || 'general'
    },
    intent: overrideIntent || null,
    localIntent,
    tone: settings.tone || 'auto',
    outputFormat: settings.outputFormat || 'markdown',
    language: settings.language || 'auto'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${backendUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openai-key': openaiKey,
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Processing failed: ${res.status}`);
    }

    // Handle SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullOutput = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            broadcastToPanel({ type: 'GENERATION_COMPLETE', output: fullOutput });
            lastOutput = fullOutput;
            // Save to history
            await saveToHistory({ transcript, output: fullOutput, context, intent: localIntent?.primary_intent || 'custom' });
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'intent') {
              broadcastToPanel({ type: 'INTENT_SERVER', intent: parsed.intent });
            } else if (parsed.type === 'chunk') {
              fullOutput += parsed.text;
              broadcastToPanel({ type: 'STREAM_CHUNK', text: parsed.text });
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (parseErr) {
            // Non-JSON SSE line — append as raw text
            if (data && data !== '[DONE]') {
              fullOutput += data;
              broadcastToPanel({ type: 'STREAM_CHUNK', text: data });
            }
          }
        }
      }
    }
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Generation timed out. Try again.');
    throw err;
  }
}

async function refineOutput({ refinement, previousOutput, context, transcript }) {
  const backendUrl = await getBackendUrl();
  const openaiKey = await getDecryptedKey('openai');
  const { settings = {} } = await chrome.storage.local.get('settings');

  const res = await fetch(`${backendUrl}/process/refine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openai-key': openaiKey,
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ refinement, previousOutput, transcript, context, settings })
  });

  if (!res.ok) throw new Error(`Refine failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullOutput = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          broadcastToPanel({ type: 'GENERATION_COMPLETE', output: fullOutput });
          lastOutput = fullOutput;
          break;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'chunk') {
            fullOutput += parsed.text;
            broadcastToPanel({ type: 'STREAM_CHUNK', text: parsed.text });
          }
        } catch (_) {}
      }
    }
  }
}

async function getPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return {};
    currentTabId = tab.id;
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
    return response?.context || {};
  } catch {
    return {};
  }
}

async function saveToHistory(entry) {
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    const newEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      timestamp: Date.now(),
      ...entry
    };
    const updated = [newEntry, ...history].slice(0, 50);
    await chrome.storage.local.set({ history: updated });
    broadcastToPanel({ type: 'HISTORY_UPDATED', count: updated.length });
  } catch (err) {
    console.warn('[Productify SW] Failed to save history:', err);
  }
}

async function encryptAndStoreKeys(rawKeys) {
  const { cryptoKeyRaw } = await chrome.storage.local.get('cryptoKeyRaw');
  let keyBytes = cryptoKeyRaw;
  if (!keyBytes) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    keyBytes = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    await chrome.storage.local.set({ cryptoKeyRaw: keyBytes });
  }
  const cryptoKey = await crypto.subtle.importKey('raw', new Uint8Array(keyBytes), { name: 'AES-GCM' }, false, ['encrypt']);
  const { encryptedKeys = {} } = await chrome.storage.local.get('encryptedKeys');
  for (const [name, value] of Object.entries(rawKeys)) {
    if (!value) continue;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(value);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);
    const combined = new Uint8Array(iv.length + ct.byteLength);
    combined.set(iv); combined.set(new Uint8Array(ct), iv.length);
    encryptedKeys[name] = btoa(String.fromCharCode(...combined));
  }
  await chrome.storage.local.set({ encryptedKeys });
}

// ─────────────────────────────────────────────────────────────────
// OFFSCREEN DOCUMENT MANAGEMENT
// ─────────────────────────────────────────────────────────────────
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Productify needs microphone access for voice recording.'
  });
}

// ─────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────
function broadcastToPanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Side panel might not be open — ignore
  });
}
