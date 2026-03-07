/**
 * Briefly — intentClassifier.js (background)
 * Local intent pre-classification using keyword matching + scoring.
 * This runs in the service worker for fast local pre-classification
 * before the server does the full LLM-based classification.
 */

const INTENT_PATTERNS = {
  summarize: {
    keywords: ['summarize', 'summary', 'key points', 'tldr', 'overview', 'give me a summary', 'main points', 'recap', 'brief', 'condense', 'digest'],
    weight: 1.0
  },
  prompt_generation: {
    keywords: ['create a prompt', 'generate a prompt', 'write a prompt', 'make a prompt', 'reusable prompt', 'prompt for', 'draft a prompt', 'prompt template'],
    weight: 1.0
  },
  task_extraction: {
    keywords: ['action items', 'todo', 'to-do', 'tasks', 'extract tasks', 'list tasks', 'what needs to be done', 'next steps', 'deliverables', 'action points'],
    weight: 1.0
  },
  documentation: {
    keywords: ['document', 'documentation', 'write docs', 'api docs', 'readme', 'doc this', 'document this', 'write up', 'spec', 'technical doc'],
    weight: 1.0
  },
  testing: {
    keywords: ['test cases', 'test', 'testing', 'generate tests', 'unit test', 'what to test', 'coverage', 'test scenarios', 'qa', 'quality assurance', 'test suite'],
    weight: 1.0
  },
  code_review: {
    keywords: ['review', 'code review', 'review this', 'feedback on code', 'pr review', 'pull request', 'audit', 'check the code', 'issues with', 'bugs in'],
    weight: 1.0
  },
  user_story: {
    keywords: ['user story', 'as a user', 'acceptance criteria', 'agile', 'epic', 'feature story', 'write a story', 'user requirement'],
    weight: 1.0
  },
  explain: {
    keywords: ['explain', 'what is', 'how does', 'break down', 'clarify', 'help me understand', 'what does this mean', 'describe', 'eli5', 'elaborate', "i don't understand"],
    weight: 1.0
  },
  translate_intent: {
    keywords: ['translate', 'in english', 'in spanish', 'in french', 'in german', 'in japanese', 'in chinese', 'convert to', 'language', 'from english', 'into french'],
    weight: 1.0
  },
  email_draft: {
    keywords: ['email', 'draft email', 'write an email', 'compose', 'reply to', 'follow up', 'email draft', 'write a message', 'email template', 'send a message'],
    weight: 1.0
  },
  compare: {
    keywords: ['compare', 'difference', 'versus', 'vs', 'contrast', "what's different", 'compare these', 'pros and cons', 'similarities', 'which is better'],
    weight: 1.0
  }
};

const INTENT_ICONS = {
  summarize: '📝',
  prompt_generation: '✨',
  task_extraction: '✅',
  documentation: '📚',
  testing: '🧪',
  code_review: '🔍',
  user_story: '📖',
  explain: '💡',
  translate_intent: '🌐',
  email_draft: '✉️',
  compare: '⚖️',
  custom: '🔮'
};

const IntentClassifier = {
  /**
   * Classify transcript locally using keyword scoring.
   * Returns { primary_intent, secondary_intent, confidence, fallback }
   */
  classify(transcript) {
    if (!transcript || transcript.trim().length < 2) {
      return { primary_intent: 'custom', secondary_intent: null, confidence: 0, fallback: true };
    }

    const text = transcript.toLowerCase().trim();
    const scores = {};

    // Score each intent
    for (const [intent, { keywords, weight }] of Object.entries(INTENT_PATTERNS)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          // Longer keyword match scores higher
          score += (kw.length / 5) * weight;
        }
      }
      if (score > 0) scores[intent] = score;
    }

    const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

    if (sorted.length === 0) {
      return { primary_intent: 'custom', secondary_intent: null, confidence: 0.5, fallback: true };
    }

    const topScore = sorted[0][1];
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.99, topScore / (totalScore * 0.7 + topScore * 0.3));

    return {
      primary_intent: sorted[0][0],
      secondary_intent: sorted[1]?.[0] || null,
      confidence: Math.round(confidence * 100) / 100,
      fallback: confidence < 0.7,
      top3: sorted.slice(0, 3).map(([intent]) => intent)
    };
  },

  getIcon(intent) {
    return INTENT_ICONS[intent] || INTENT_ICONS.custom;
  },

  getLabel(intent) {
    const labels = {
      summarize: 'Summarize',
      prompt_generation: 'Prompt Gen',
      task_extraction: 'Task Extract',
      documentation: 'Documentation',
      testing: 'Testing',
      code_review: 'Code Review',
      user_story: 'User Story',
      explain: 'Explain',
      translate_intent: 'Translate',
      email_draft: 'Email Draft',
      compare: 'Compare',
      custom: 'Custom'
    };
    return labels[intent] || 'Custom';
  }
};

if (typeof module !== 'undefined') module.exports = IntentClassifier;
if (typeof self !== 'undefined') self.IntentClassifier = IntentClassifier;
