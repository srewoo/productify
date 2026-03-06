/**
 * Productify — services/contextEnricher.js
 * Enriches raw page context before sending to LLM generation.
 */

/**
 * Enrich and clean up raw context from content script.
 * @param {Object} rawContext — from contentScript.js
 * @param {string} transcript — user's voice input
 * @returns {Object} enriched context
 */
export function enrichContext(rawContext, transcript) {
  const ctx = { ...rawContext };

  // Determine focus area based on transcript keywords
  const lowerTranscript = transcript.toLowerCase();
  if (rawContext.selectedText && rawContext.selectedText.length > 20) {
    ctx.focusArea = 'selected_text';
    ctx.primaryContent = rawContext.selectedText;
  } else if (rawContext.codeBlocks?.length > 0 && (lowerTranscript.includes('code') || lowerTranscript.includes('function') || lowerTranscript.includes('review') || lowerTranscript.includes('test'))) {
    ctx.focusArea = 'code';
    ctx.primaryContent = rawContext.codeBlocks.map(b => `[${b.lang}]\n${b.code}`).join('\n\n').slice(0, 3000);
  } else {
    ctx.focusArea = 'full_page';
    ctx.primaryContent = rawContext.visibleText?.slice(0, 3000) || '';
  }

  // Add domain-specific context hints
  ctx.domainHints = buildDomainHints(rawContext.pageType, rawContext.domainContext);

  // Truncate visible text to avoid token overflow
  ctx.visibleText = rawContext.visibleText?.slice(0, 2000) || '';

  // Add transcript-derived parameters
  ctx.transcriptParams = extractTranscriptParams(transcript);

  return ctx;
}

function buildDomainHints(pageType, domainContext) {
  const hints = [];
  if (domainContext?.tool) hints.push(`Platform: ${domainContext.tool}`);
  switch (pageType) {
    case 'github-pr': hints.push('Context: GitHub Pull Request — focus on code changes and review feedback'); break;
    case 'github-issue': hints.push('Context: GitHub Issue — focus on bug/feature description and reproduction'); break;
    case 'jira-ticket': hints.push('Context: Jira ticket — focus on task details, acceptance criteria, and status'); break;
    case 'confluence-doc': hints.push('Context: Confluence documentation page — focus on technical documentation structure'); break;
    case 'notion-page': hints.push('Context: Notion page — flexible document structure'); break;
    case 'research-paper': hints.push('Context: Academic/research paper — preserve citations and technical precision'); break;
    case 'documentation': hints.push('Context: Technical documentation — precision and completeness are key'); break;
    case 'article': hints.push('Context: Article or blog post — focus on narrative and key arguments'); break;
  }
  return hints;
}

function extractTranscriptParams(transcript) {
  const lower = transcript.toLowerCase();
  return {
    wantsShort: lower.includes('brief') || lower.includes('short') || lower.includes('quick') || lower.includes('concise'),
    wantsDetailed: lower.includes('detailed') || lower.includes('comprehensive') || lower.includes('thorough') || lower.includes('in-depth'),
    wantsBullets: lower.includes('bullet') || lower.includes('list') || lower.includes('points'),
    wantsFormal: lower.includes('formal') || lower.includes('professional'),
    wantsCasual: lower.includes('casual') || lower.includes('simple') || lower.includes('friendly'),
    targetLanguage: extractTargetLanguage(lower)
  };
}

function extractTargetLanguage(text) {
  const langs = { 'in english': 'en', 'in spanish': 'es', 'in french': 'fr', 'in german': 'de', 'in japanese': 'ja', 'in chinese': 'zh', 'in hindi': 'hi', 'in arabic': 'ar', 'in portuguese': 'pt' };
  for (const [phrase, code] of Object.entries(langs)) {
    if (text.includes(phrase)) return code;
  }
  return null;
}
