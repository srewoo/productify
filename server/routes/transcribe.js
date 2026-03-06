/**
 * Productify — routes/transcribe.js
 * POST /transcribe — audio → text via Whisper or Google STT
 */

import multer from 'multer';
import FormData from 'form-data';
import fetch from 'node-fetch';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

export const transcribeRoute = [
  upload.single('audio'),
  async (req, res) => {
    const openaiKey = req.headers['x-openai-key'] || process.env.DEMO_OPENAI_KEY;
    const googleKey = req.headers['x-google-stt-key'];
    const elevenKey = req.headers['x-elevenlabs-key'];
    const provider = req.body?.provider || 'whisper';
    const language = req.body?.language || 'auto';

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided.' });
    }

    try {
      let transcript;

      if (provider === 'google' && googleKey) {
        transcript = await transcribeWithGoogle(req.file.buffer, req.file.mimetype, googleKey, language);
      } else if (provider === 'elevenlabs' && elevenKey) {
        transcript = await transcribeWithElevenLabs(req.file.buffer, req.file.mimetype, elevenKey, language);
      } else {
        if (!openaiKey) return res.status(401).json({ error: 'OpenAI API key required. Add it in Settings.' });
        transcript = await transcribeWithWhisper(req.file.buffer, req.file.originalname || 'audio.webm', openaiKey, language);
      }

      res.json({ transcript, provider, language });
    } catch (err) {
      // Log full error object for debugging instead of just message
      console.error('[/transcribe]', err);
      const message =
        (typeof err.message === 'string' && err.message !== '[object Object]')
          ? err.message
          : JSON.stringify(err, null, 2);
      res.status(500).json({ error: message || 'Transcription failed.' });
    }
  }
];

async function transcribeWithWhisper(audioBuffer, filename, apiKey, language) {
  const form = new FormData();
  form.append('file', audioBuffer, { filename, contentType: 'audio/webm' });
  // Use configurable transcription model; default to newer GPT-based STT
  // to avoid "project does not have access to whisper-1" errors.
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
  form.append('model', model);
  if (language && language !== 'auto') form.append('language', language);
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Whisper API error: ${res.status}`);
  }
  const data = await res.json();
  return data.text || '';
}

async function transcribeWithGoogle(audioBuffer, mimeType, apiKey, language) {
  const encoding = mimeType.includes('webm') ? 'WEBM_OPUS' : 'LINEAR16';
  const body = {
    config: {
      encoding,
      sampleRateHertz: 16000,
      languageCode: language === 'auto' ? 'en-US' : language,
      enableAutomaticPunctuation: true,
      model: 'latest_long'
    },
    audio: { content: audioBuffer.toString('base64') }
  };

  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google STT error: ${res.status}`);
  }
  const data = await res.json();
  return data.results
    ?.map(r => r.alternatives?.[0]?.transcript || '')
    .join(' ')
    .trim() || '';
}

async function transcribeWithElevenLabs(audioBuffer, mimeType, apiKey, language) {
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: mimeType || 'audio/webm'
  });
  // Use valid ElevenLabs STT model; allow override via env
  // Current public models: 'scribe_v1', 'scribe_v1_experimental', 'scribe_v2'
  form.append('model_id', process.env.ELEVEN_STT_MODEL_ID || 'scribe_v2');
  if (language && language !== 'auto') {
    form.append('language_code', language);
  }

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      ...form.getHeaders()
    },
    body: form
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '');
    let parsed;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsed = {};
    }

    // Log full ElevenLabs response for server-side debugging
    console.error('[/transcribe] ElevenLabs STT error', res.status, parsed || rawBody);

    const message =
      parsed.error ||
      parsed.message ||
      parsed.detail?.message ||
      parsed.detail ||
      rawBody ||
      `ElevenLabs STT error: ${res.status}`;

    throw new Error(message);
  }

  const data = await res.json();
  // According to docs, 'text' contains the transcript
  return data.text || data.transcript || '';
}
