/**
 * Productify — routes/process.js
 * POST /process     — transcript + context → SSE-streamed AI output
 * POST /process/refine — refine previous output with new command
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, '../prompts');

const INTENT_LABELS = ['summarize','prompt_generation','task_extraction','documentation','testing','code_review','user_story','explain','translate_intent','email_draft','compare','custom'];

function loadPrompt(intent) {
  try {
    return readFileSync(join(PROMPTS_DIR, `${intent}.txt`), 'utf-8');
  } catch {
    return readFileSync(join(PROMPTS_DIR, 'custom.txt'), 'utf-8');
  }
}

function buildSystemPrompt(intent, tone, outputFormat) {
  const base = loadPrompt(intent);
  const toneNote = tone && tone !== 'auto' ? `\nTone: ${tone}` : '';
  const formatNote = outputFormat === 'plain' ? '\nOutput format: Plain text (no markdown).' : outputFormat === 'structured' ? '\nPrefer structured output with tables and lists.' : '\nOutput format: Well-formatted Markdown.';
  return `${base}${toneNote}${formatNote}`;
}

function buildUserMessage(transcript, context) {
  const parts = [`User voice command: "${transcript}"`];
  if (context.selectedText) parts.push(`\nSelected text:\n"""\n${context.selectedText.slice(0, 1500)}\n"""`);
  if (context.codeBlocks?.length) {
    const code = context.codeBlocks.map(b => `[${b.lang}]\n${b.code}`).join('\n\n');
    parts.push(`\nCode found on page:\n\`\`\`\n${code.slice(0, 2000)}\n\`\`\``);
  }
  if (context.visibleText && !context.selectedText) {
    parts.push(`\nPage content:\n${context.visibleText.slice(0, 2000)}`);
  }
  if (context.headings?.length) {
    parts.push(`\nPage headings: ${context.headings.map(h => h.text).join(' > ')}`);
  }
  if (context.pageType && context.pageType !== 'general') {
    parts.push(`\nPage type: ${context.pageType}`);
  }
  if (context.pageTitle) parts.push(`\nPage title: ${context.pageTitle}`);
  if (context.url) parts.push(`\nURL: ${context.url}`);
  return parts.join('\n');
}

async function classifyIntent(transcript, openaiKey, localIntent) {
  // Start with local classification hint
  if (localIntent?.confidence >= 0.8 && !localIntent?.fallback) {
    return localIntent;
  }
  // LLM-based classification
  const client = new OpenAI({ apiKey: openaiKey });
  const intentsStr = INTENT_LABELS.map((i, idx) => `${idx + 1}. ${i}`).join(', ');
  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 100,
    messages: [{
      role: 'system',
      content: `You are an intent classifier. Given a voice command, classify it into one of these intents: ${intentsStr}. Respond with JSON: {"primary":"<intent>","secondary":"<intent_or_null>","confidence":0.0-1.0}`
    }, {
      role: 'user',
      content: transcript
    }]
  });
  try {
    const parsed = JSON.parse(res.choices[0].message.content);
    return {
      primary_intent: parsed.primary || 'custom',
      secondary_intent: parsed.secondary || null,
      confidence: parsed.confidence || 0.8,
      fallback: parsed.confidence < 0.7
    };
  } catch {
    return { primary_intent: 'custom', secondary_intent: null, confidence: 0.5, fallback: true };
  }
}

export async function processRoute(req, res) {
  const openaiKey = req.headers['x-openai-key'] || process.env.DEMO_OPENAI_KEY;
  if (!openaiKey) return res.status(401).json({ error: 'OpenAI API key required.' });

  const { transcript, context = {}, intent: forcedIntent, localIntent, tone, outputFormat, language } = req.body;
  if (!transcript?.trim()) return res.status(400).json({ error: 'Transcript is required.' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    // Classify intent
    const intentResult = forcedIntent
      ? { primary_intent: forcedIntent, secondary_intent: null, confidence: 1.0, fallback: false }
      : await classifyIntent(transcript, openaiKey, localIntent);

    sendEvent({ type: 'intent', intent: intentResult });

    const client = new OpenAI({ apiKey: openaiKey });
    const systemPrompt = buildSystemPrompt(intentResult.primary_intent, tone, outputFormat);
    const userMessage = buildUserMessage(transcript, context);

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) sendEvent({ type: 'chunk', text });
    }

    // Handle secondary intent if present
    if (intentResult.secondary_intent && intentResult.secondary_intent !== intentResult.primary_intent) {
      sendEvent({ type: 'chunk', text: '\n\n---\n\n' });
      const sysPrompt2 = buildSystemPrompt(intentResult.secondary_intent, tone, outputFormat);
      const stream2 = await client.chat.completions.create({
        model: 'gpt-4o',
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
        messages: [{ role: 'system', content: sysPrompt2 }, { role: 'user', content: userMessage }]
      });
      for await (const chunk of stream2) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) sendEvent({ type: 'chunk', text });
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    sendEvent({ type: 'error', message: err.message });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export async function refineRoute(req, res) {
  const openaiKey = req.headers['x-openai-key'] || process.env.DEMO_OPENAI_KEY;
  if (!openaiKey) return res.status(401).json({ error: 'OpenAI API key required.' });

  const { refinement, previousOutput, transcript, context, settings } = req.body;
  if (!previousOutput) return res.status(400).json({ error: 'No previous output to refine.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    const client = new OpenAI({ apiKey: openaiKey });
    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful AI assistant that refines and improves previously generated content based on user feedback. Maintain the same format and style unless asked to change it.'
        },
        { role: 'user', content: `Original request: "${transcript || 'unknown'}"` },
        { role: 'assistant', content: previousOutput },
        { role: 'user', content: refinement ? `Please refine: ${refinement}` : 'Please improve this output.' }
      ]
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) sendEvent({ type: 'chunk', text });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    sendEvent({ type: 'error', message: err.message });
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
