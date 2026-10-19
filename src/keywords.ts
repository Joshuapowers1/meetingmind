/**
 * Keyword Detection System
 * Identifies important keywords and phrases from meeting transcripts
 */

export interface DetectedKeyword {
  keyword: string;
  category: KeywordCategory;
  context: string;
  confidence: number;
}

export type KeywordCategory =
  | "action_item"
  | "decision"
  | "question"
  | "deadline"
  | "person"
  | "topic"
  | "followup"
  | "blocker"
  | "agreement"
  | "number";

// Patterns for detecting different types of keywords
const ACTION_PATTERNS = [
  /\b(need to|needs to|have to|has to)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(will|i'll|we'll|they'll)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(should|must|going to)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(action item|todo|to-do|task)[:.]?\s*(\w+(\s+\w+){0,10})/gi,
  /\b(can you|could you|would you)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(please|pls)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(let's|let us)\s+(\w+(\s+\w+){0,5})/gi,
];

const DECISION_PATTERNS = [
  /\b(decided|decision|agreed|agreement)\s+(\w+(\s+\w+){0,10})/gi,
  /\b(confirmed|approved|rejected|denied)\s*(\w+(\s+\w+){0,5})?/gi,
  /\b(we('re| are) going with|let's go with)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(final(ly)?|ultimately)\s+(decided|chose|picked|selected)/gi,
  /\b(consensus|unanimous|everyone agrees)/gi,
];

const DEADLINE_PATTERNS = [
  /\b(by|before|until|due)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
  /\b(by|before|until|due)\s+(next week|this week|end of day|eod|end of week|eow)/gi,
  /\b(by|before|until|due)\s+(\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)/gi,
  /\b(deadline|due date)[:.]?\s*(\w+(\s+\w+){0,5})/gi,
  /\b(asap|urgent|immediately|right away)/gi,
  /\b(in\s+\d+\s+(days?|weeks?|hours?|months?))/gi,
];

const FOLLOWUP_PATTERNS = [
  /\b(follow up|followup|follow-up)\s*(on|with|about)?(\s+\w+(\s+\w+){0,5})?/gi,
  /\b(circle back|get back to|revisit)\s*(\w+(\s+\w+){0,5})?/gi,
  /\b(schedule|set up|arrange)\s+(a\s+)?(meeting|call|sync)/gi,
  /\b(touch base|check in)\s*(with|on)?(\s+\w+(\s+\w+){0,3})?/gi,
];

const BLOCKER_PATTERNS = [
  /\b(blocked|blocker|blocking|stuck)\s*(on|by)?(\s+\w+(\s+\w+){0,5})?/gi,
  /\b(waiting (on|for)|depends on|dependency)\s*(\w+(\s+\w+){0,5})?/gi,
  /\b(can't|cannot|unable to)\s+(\w+(\s+\w+){0,5})/gi,
  /\b(issue|problem|challenge|obstacle)\s*(with|is)?(\s+\w+(\s+\w+){0,5})?/gi,
];

const NUMBER_PATTERNS = [
  /\$[\d,]+(\.\d{2})?/g, // Money
  /\b\d+%/g, // Percentages
  /\b\d{1,3}(,\d{3})*(\.\d+)?\s*(million|billion|thousand|k|m|b)/gi, // Large numbers
  /\b(q[1-4]|quarter\s*[1-4])/gi, // Quarters
  /\b(fy|fiscal year)\s*\d{2,4}/gi, // Fiscal years
];

/**
 * Extract surrounding context for a match
 */
function getContext(text: string, matchIndex: number, matchLength: number, contextSize: number = 50): string {
  const start = Math.max(0, matchIndex - contextSize);
  const end = Math.min(text.length, matchIndex + matchLength + contextSize);
  let context = text.slice(start, end);

  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return context.trim();
}

/**
 * Detect action items in text
 */
function detectActionItems(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];
  // Questions about commitments are not commitments themselves.
  text = (text.match(/[^.!?]+[.!?]?/g) || []).filter(sentence => !sentence.trim().endsWith("?")).join(" ");

  for (const pattern of ACTION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "action_item",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.8,
      });
    }
  }

  return results;
}

/**
 * Detect decisions in text
 */
function detectDecisions(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];

  for (const pattern of DECISION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "decision",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.85,
      });
    }
  }

  return results;
}

/**
 * Detect questions in text
 */
function detectQuestions(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    if (sentence.includes("?") || /^(who|what|when|where|why|how|can|could|would|should|is|are|do|does|will)\b/i.test(sentence.trim())) {
      if (sentence.trim().length > 10) {
        results.push({
          keyword: sentence.trim().slice(0, 100),
          category: "question",
          context: sentence.trim(),
          confidence: 0.75,
        });
      }
    }
  }

  return results;
}

/**
 * Detect deadlines in text
 */
function detectDeadlines(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];

  for (const pattern of DEADLINE_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "deadline",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.9,
      });
    }
  }

  return results;
}

/**
 * Detect follow-up items
 */
function detectFollowups(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];

  for (const pattern of FOLLOWUP_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "followup",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.8,
      });
    }
  }

  return results;
}

/**
 * Detect blockers
 */
function detectBlockers(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];

  for (const pattern of BLOCKER_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "blocker",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.85,
      });
    }
  }

  return results;
}

/**
 * Detect numbers and metrics
 */
function detectNumbers(text: string): DetectedKeyword[] {
  const results: DetectedKeyword[] = [];

  for (const pattern of NUMBER_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        keyword: match[0].trim(),
        category: "number",
        context: getContext(text, match.index, match[0].length),
        confidence: 0.95,
      });
    }
  }

  return results;
}

/**
 * Extract key topics using simple frequency analysis
 */
function extractTopics(text: string, topN: number = 10): DetectedKeyword[] {
  // Common words to ignore
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might", "can",
    "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
    "what", "which", "who", "when", "where", "why", "how", "all", "each", "every",
    "both", "few", "more", "most", "other", "some", "such", "no", "not", "only",
    "same", "so", "than", "too", "very", "just", "also", "now", "here", "there",
    "about", "into", "through", "during", "before", "after", "above", "below",
    "between", "under", "again", "further", "then", "once", "yeah", "okay", "ok",
    "like", "um", "uh", "right", "think", "know", "going", "get", "got", "thing",
    "things", "really", "actually", "basically", "literally", "kind", "sort"
  ]);

  // Extract words (2+ characters, not numbers)
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

  // Count frequency
  const freq: Map<string, number> = new Map();
  for (const word of words) {
    if (!stopWords.has(word)) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }
  }

  // Sort by frequency and take top N
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  return sorted.map(([word, count]) => ({
    keyword: word,
    category: "topic" as KeywordCategory,
    context: `Mentioned ${count} times`,
    confidence: Math.min(0.5 + (count / 20), 0.95),
  }));
}

/**
 * Main function to analyze text and extract all keywords
 */
export function analyzeText(text: string): DetectedKeyword[] {
  const allKeywords: DetectedKeyword[] = [
    ...detectActionItems(text),
    ...detectDecisions(text),
    ...detectQuestions(text),
    ...detectDeadlines(text),
    ...detectFollowups(text),
    ...detectBlockers(text),
    ...detectNumbers(text),
    ...extractTopics(text),
  ];

  // Deduplicate similar keywords
  const seen = new Set<string>();
  return allKeywords.filter(kw => {
    const key = `${kw.category}:${kw.keyword.toLowerCase().slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Analyze a single transcript line in real-time
 */
export function analyzeTranscriptLine(text: string, speakerName?: string): DetectedKeyword[] {
  return analyzeText(text).map(kw => ({
    ...kw,
    context: speakerName ? `${speakerName}: ${kw.context}` : kw.context,
  }));
}

/**
 * Get summary statistics for detected keywords
 */
export function getKeywordStats(keywords: DetectedKeyword[]): Record<KeywordCategory, number> {
  const stats: Record<string, number> = {};
  for (const kw of keywords) {
    stats[kw.category] = (stats[kw.category] || 0) + 1;
  }
  return stats as Record<KeywordCategory, number>;
}
