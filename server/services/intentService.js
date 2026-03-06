/**
 * Productify — services/intentService.js
 * Full intent classification using GPT-4o-mini with structured output.
 */

import OpenAI from 'openai';

const VALID_INTENTS = ['summarize','prompt_generation','task_extraction','documentation','testing','code_review','user_story','explain','translate_intent','email_draft','compare','custom'];

/**
 * Classify a transcript using LLM (GPT-4o-mini for speed/cost).
 * Falls back to 'custom' on any error.
 */
export async function classifyIntent(transcript, context, openaiKey) {
  if (!transcript?.trim()) {
    return { primary_intent: 'custom', secondary_intent: null, confidence: 0.5, fallback: true };
  }

  const client = new OpenAI({ apiKey: openaiKey });

  // Build a rich context summary for better classification
  const contextSummary = [
    context?.pageType ? `Page type: ${context.pageType}` : '',
    context?.domainContext?.tool ? `Platform: ${context.domainContext.tool}` : '',
    context?.codeBlocks?.length ? `Has ${context.codeBlocks.length} code block(s)` : '',
    context?.selectedText ? `Selected text: "${context.selectedText.slice(0, 100)}"` : ''
  ].filter(Boolean).join('. ');

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 150,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an intent classifier for a voice-powered productivity tool. Classify the user's voice command into one of these intents:

${VALID_INTENTS.map((i, n) => `${n+1}. ${i}`).join('\n')}

Consider the page context to improve accuracy. Respond with JSON:
{"primary": "<intent>", "secondary": "<intent_or_null>", "confidence": <0.0-1.0>, "parameters": {"scope": "selected|page|code", "tone": "formal|casual|auto", "length": "brief|normal|detailed"}}`
        },
        {
          role: 'user',
          content: `Voice command: "${transcript}"\nContext: ${contextSummary || 'general web page'}`
        }
      ]
    });

    const parsed = JSON.parse(res.choices[0].message.content);
    const primary = VALID_INTENTS.includes(parsed.primary) ? parsed.primary : 'custom';
    const secondary = parsed.secondary && VALID_INTENTS.includes(parsed.secondary) && parsed.secondary !== primary ? parsed.secondary : null;

    return {
      primary_intent: primary,
      secondary_intent: secondary,
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.8)),
      fallback: primary === 'custom' || (parsed.confidence || 0.8) < 0.7,
      parameters: parsed.parameters || {},
      top3: [primary, secondary, 'custom'].filter(Boolean)
    };
  } catch (err) {
    console.warn('[intentService] Classification failed, using custom fallback:', err.message);
    return { primary_intent: 'custom', secondary_intent: null, confidence: 0.5, fallback: true };
  }
}
