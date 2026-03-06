/**
 * Productify — routes/intents.js + library.js + health.js
 */

// ────────────── GET /intents ──────────────
export function intentsRoute(req, res) {
  res.json({
    intents: [
      { id: 'summarize', label: 'Summarize', icon: '📝', description: 'Summarize content into key points' },
      { id: 'prompt_generation', label: 'Prompt Generation', icon: '✨', description: 'Create a reusable AI prompt' },
      { id: 'task_extraction', label: 'Task Extraction', icon: '✅', description: 'Extract action items and tasks' },
      { id: 'documentation', label: 'Documentation', icon: '📚', description: 'Write technical documentation' },
      { id: 'testing', label: 'Testing', icon: '🧪', description: 'Generate test cases' },
      { id: 'code_review', label: 'Code Review', icon: '🔍', description: 'Review code and suggest improvements' },
      { id: 'user_story', label: 'User Story', icon: '📖', description: 'Write an Agile user story' },
      { id: 'explain', label: 'Explain', icon: '💡', description: 'Explain in plain English' },
      { id: 'translate_intent', label: 'Translate', icon: '🌐', description: 'Translate and process content' },
      { id: 'email_draft', label: 'Email Draft', icon: '✉️', description: 'Draft a professional email' },
      { id: 'compare', label: 'Compare', icon: '⚖️', description: 'Compare two or more things' },
      { id: 'custom', label: 'Custom', icon: '🔮', description: 'Free-form AI response' }
    ]
  });
}
