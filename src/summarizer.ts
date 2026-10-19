/**
 * AI Summarization Module
 * Uses OpenAI to generate meeting summaries and extract action items
 */

import OpenAI from "openai";
import { DetectedKeyword } from "./keywords";

// Lazy-initialize OpenAI client only when needed
let openaiClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

export interface MeetingSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  decisions: string[];
  nextSteps: string[];
  participants: string[];
}

export interface ActionItem {
  description: string;
  assignee?: string;
  dueDate?: string;
  priority?: "high" | "medium" | "low";
}

/**
 * Generate a comprehensive meeting summary from transcript
 */
export async function generateMeetingSummary(
  transcript: string,
  keywords?: DetectedKeyword[]
): Promise<MeetingSummary> {
  const keywordContext = keywords
    ? `\n\nDetected keywords and topics:\n${keywords
        .slice(0, 20)
        .map(k => `- ${k.category}: ${k.keyword}`)
        .join("\n")}`
    : "";

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert meeting note-taker and summarizer. Your job is to extract the most important information from meeting transcripts and present it in a clear, actionable format.

Focus on:
- Key decisions made
- Action items with owners and deadlines
- Important topics discussed
- Next steps
- Any blockers or concerns raised

Be concise but comprehensive. Use bullet points for clarity.`,
      },
      {
        role: "user",
        content: `Please analyze this meeting transcript and provide a structured summary.

TRANSCRIPT:
${transcript}
${keywordContext}

Respond in JSON format with this structure:
{
  "title": "A short, descriptive title for this meeting",
  "summary": "2-3 sentence executive summary",
  "keyPoints": ["key point 1", "key point 2", ...],
  "actionItems": [
    {"description": "task description", "assignee": "person name or null", "dueDate": "deadline or null", "priority": "high/medium/low"}
  ],
  "decisions": ["decision 1", "decision 2", ...],
  "nextSteps": ["next step 1", "next step 2", ...],
  "participants": ["participant names mentioned"]
}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  return JSON.parse(content) as MeetingSummary;
}

/**
 * Generate a quick summary for real-time display (faster, shorter)
 */
export async function generateQuickSummary(
  recentTranscript: string,
  previousContext?: string
): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a real-time meeting assistant. Provide brief, bullet-point updates on what's being discussed. Be extremely concise.",
      },
      {
        role: "user",
        content: `${previousContext ? `Previous context: ${previousContext}\n\n` : ""}Recent transcript:\n${recentTranscript}\n\nProvide 2-3 bullet points on what's being discussed right now:`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Extract action items from transcript
 */
export async function extractActionItems(transcript: string): Promise<ActionItem[]> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert at identifying action items from meeting transcripts.
Extract all tasks, to-dos, and follow-ups mentioned.
Identify who is responsible (if mentioned) and any deadlines.
Be thorough - don't miss any commitments or tasks.`,
      },
      {
        role: "user",
        content: `Extract all action items from this transcript:

${transcript}

Respond in JSON format:
{
  "actionItems": [
    {"description": "task", "assignee": "person or null", "dueDate": "deadline or null", "priority": "high/medium/low"}
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return [];
  }

  const parsed = JSON.parse(content);
  return parsed.actionItems || [];
}

/**
 * Generate a title for the meeting based on content
 */
export async function generateMeetingTitle(transcript: string): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Generate a short, descriptive title (3-7 words) for this meeting based on the transcript. Just respond with the title, nothing else.",
      },
      {
        role: "user",
        content: transcript.slice(0, 2000),
      },
    ],
    temperature: 0.3,
    max_tokens: 30,
  });

  return response.choices[0]?.message?.content?.trim() || "Untitled Meeting";
}

/**
 * Fallback summary when OpenAI is not available
 */
export function generateOfflineSummary(
  transcript: string,
  keywords: DetectedKeyword[]
): MeetingSummary {
  const lines = transcript.split("\n").filter(l => l.trim());
  const actionKeywords = keywords.filter(k => k.category === "action_item");
  const decisionKeywords = keywords.filter(k => k.category === "decision");
  const topicKeywords = keywords.filter(k => k.category === "topic");

  // Extract unique speaker names
  const speakers = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^([^:]+):/);
    if (match) {
      speakers.add(match[1].trim());
    }
  }

  return {
    title: topicKeywords[0]?.keyword
      ? `Meeting about ${topicKeywords[0].keyword}`
      : "Meeting Notes",
    summary: `Meeting with ${speakers.size} participants. ${actionKeywords.length} possible action items and ${decisionKeywords.length} decision signals detected by keywords. Review these excerpts to confirm.`,
    keyPoints: topicKeywords.slice(0, 5).map(k => `Discussed: ${k.keyword}`),
    actionItems: actionKeywords.slice(0, 10).map(k => ({
      description: k.keyword,
      priority: "medium" as const,
    })),
    decisions: decisionKeywords.slice(0, 5).map(k => k.keyword),
    nextSteps: keywords
      .filter(k => k.category === "followup")
      .slice(0, 5)
      .map(k => k.keyword),
    participants: Array.from(speakers),
  };
}

/**
 * Check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
