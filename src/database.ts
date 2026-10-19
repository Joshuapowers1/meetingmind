/**
 * =============================================================================
 * DATABASE MODULE - Local SQLite Storage
 * =============================================================================
 *
 * This module provides all database operations for the Do This For Me app.
 * Uses SQLite with better-sqlite3 for synchronous, performant local storage.
 *
 * ## Database Schema Overview:
 *
 * ### Core Tables:
 * - meetings: Main meeting records with metadata
 * - participants: People who attended meetings
 * - transcripts: Real-time transcript segments
 * - keywords: Detected keywords/phrases from transcripts
 * - notes: AI-generated summaries and user notes
 * - action_items: Tasks extracted from meetings
 *
 * ### CRM Tables:
 * - companies: Organization records
 * - contacts: Individual contact records
 * - contact_meetings: Links contacts to meetings
 * - relationships: Contact relationship tracking
 *
 * ### Collaboration Tables:
 * - teams: Team definitions
 * - comments: Comments on meetings/transcripts
 * - shares: Shareable meeting links
 * - folders: Meeting organization
 * - tags: Meeting categorization
 *
 * ### Fathom/Granola-Inspired Tables:
 * - highlights: Meeting clips/key moments (Fathom-style)
 * - meeting_templates: Pre-built meeting structures (1:1, standup, sales)
 * - user_settings: App preferences including auto-join settings
 * - ai_conversations: "Ask DTFM" chat sessions (Fathom's Ask Fathom)
 * - ai_messages: Messages within AI conversations
 * - enhanced_notes: Rough-to-polished notes (Granola-style)
 * - followup_emails: AI-generated follow-up emails
 * - meeting_scores: Coaching scorecards (Fathom-style)
 *
 * ### Integration Tables:
 * - webhooks: External webhook configurations
 * - calendar_events: Calendar sync for auto-join
 * - exports: Export job tracking
 *
 * ## Usage:
 * Import functions directly: import * as db from "./database"
 *
 * @module database
 * =============================================================================
 */

import Database from "better-sqlite3";
import path from "path";
import { randomUUID as uuidv4 } from "crypto";
import fs from "fs";
import "dotenv/config";
import crypto from "crypto";

// Initialize SQLite database (stored locally in ./data/meetings.db)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "meetings.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create all tables
db.exec(`
  -- ==================== CORE TABLES ====================

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT,
    meeting_url TEXT,
    platform TEXT,
    bot_id TEXT,
    recording_id TEXT,
    status TEXT DEFAULT 'active',
    duration_seconds INTEGER DEFAULT 0,
    contact_id TEXT,
    company_id TEXT,
    folder_id TEXT,
    is_shared INTEGER DEFAULT 0,
    share_token TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (folder_id) REFERENCES folders(id)
  );

  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    contact_id TEXT,
    participant_id TEXT,
    name TEXT,
    email TEXT,
    is_host INTEGER DEFAULT 0,
    platform TEXT,
    talk_time_seconds INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    participant_id TEXT,
    speaker_name TEXT,
    text TEXT NOT NULL,
    is_final INTEGER DEFAULT 1,
    sentiment TEXT,
    timestamp_relative REAL,
    timestamp_absolute TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS keywords (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    category TEXT,
    context TEXT,
    transcript_id TEXT,
    confidence REAL DEFAULT 0.8,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    user_id TEXT,
    type TEXT DEFAULT 'summary',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    contact_id TEXT,
    description TEXT NOT NULL,
    assignee TEXT,
    due_date TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  -- ==================== CRM TABLES ====================

  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    industry TEXT,
    size TEXT,
    website TEXT,
    logo_url TEXT,
    notes TEXT,
    tags TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    title TEXT,
    avatar_url TEXT,
    linkedin_url TEXT,
    notes TEXT,
    tags TEXT,
    last_contacted_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS contact_meetings (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    meeting_id TEXT NOT NULL,
    role TEXT DEFAULT 'attendee',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    type TEXT,
    strength INTEGER DEFAULT 50,
    notes TEXT,
    last_interaction_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  -- ==================== COLLABORATION TABLES ====================

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    transcript_id TEXT,
    user_id TEXT,
    user_name TEXT,
    content TEXT NOT NULL,
    mentions TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
  );

  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT,
    expires_at TEXT,
    access_level TEXT DEFAULT 'view',
    password_hash TEXT,
    view_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    color TEXT,
    icon TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES folders(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meeting_tags (
    meeting_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (meeting_id, tag_id),
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  );

  -- ==================== INTEGRATIONS TABLES ====================

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    external_id TEXT,
    provider TEXT,
    title TEXT,
    meeting_url TEXT,
    start_time TEXT,
    end_time TEXT,
    attendees TEXT,
    auto_join INTEGER DEFAULT 0,
    meeting_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    name TEXT,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_triggered_at TEXT,
    failure_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    event TEXT,
    payload TEXT,
    response_code INTEGER,
    response_body TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
  );

  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    format TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    file_path TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  CREATE TABLE IF NOT EXISTS email_summaries (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    recipients TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  -- ==================== ANALYTICS TABLES ====================

  CREATE TABLE IF NOT EXISTS daily_stats (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    meeting_count INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    action_items_created INTEGER DEFAULT 0,
    action_items_completed INTEGER DEFAULT 0,
    keywords_detected INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS speaker_stats (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    speaker_name TEXT,
    contact_id TEXT,
    talk_time_seconds INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    interruptions INTEGER DEFAULT 0,
    questions_asked INTEGER DEFAULT 0,
    action_items_assigned INTEGER DEFAULT 0,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  -- ==================== INDEXES ====================

  CREATE INDEX IF NOT EXISTS idx_meetings_contact ON meetings(contact_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_company ON meetings(company_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_folder ON meetings(folder_id);
  CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
  CREATE INDEX IF NOT EXISTS idx_meetings_created ON meetings(created_at);

  CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_keywords_meeting ON keywords(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_keywords_category ON keywords(category);
  CREATE INDEX IF NOT EXISTS idx_notes_meeting ON notes(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
  CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items(assignee);

  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
  CREATE INDEX IF NOT EXISTS idx_contact_meetings_contact ON contact_meetings(contact_id);
  CREATE INDEX IF NOT EXISTS idx_contact_meetings_meeting ON contact_meetings(meeting_id);

  CREATE INDEX IF NOT EXISTS idx_comments_meeting ON comments(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
  CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);

  CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
  CREATE INDEX IF NOT EXISTS idx_speaker_stats_meeting ON speaker_stats(meeting_id);

  -- ==================== FATHOM/GRANOLA-INSPIRED TABLES ====================

  -- Meeting highlights (like Fathom clips)
  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    transcript_id TEXT,
    timestamp_start REAL,
    timestamp_end REAL,
    label TEXT,
    note TEXT,
    type TEXT DEFAULT 'highlight',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
  );

  -- Meeting templates (1:1, standup, sales call, interview, etc.)
  CREATE TABLE IF NOT EXISTS meeting_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT DEFAULT '#6366f1',
    prompt_instructions TEXT,
    sections TEXT,
    auto_detect_keywords TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- User settings for auto-join, preferences
  CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    auto_join_enabled INTEGER DEFAULT 0,
    auto_join_minutes_before INTEGER DEFAULT 1,
    default_bot_name TEXT DEFAULT 'Meeting Notetaker',
    default_template_id TEXT,
    ngrok_url TEXT,
    google_calendar_connected INTEGER DEFAULT 0,
    outlook_connected INTEGER DEFAULT 0,
    auto_summarize INTEGER DEFAULT 1,
    auto_detect_action_items INTEGER DEFAULT 1,
    notification_email TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_template_id) REFERENCES meeting_templates(id)
  );

  -- AI conversations (Ask DTFM - chat across meetings like Fathom)
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    meeting_ids TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
  );

  -- Enhanced notes (Granola-style: rough notes + AI polish)
  CREATE TABLE IF NOT EXISTS enhanced_notes (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    raw_notes TEXT,
    enhanced_notes TEXT,
    enhancement_prompt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  -- Follow-up emails
  CREATE TABLE IF NOT EXISTS followup_emails (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    recipient_email TEXT,
    recipient_name TEXT,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'draft',
    sent_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id)
  );

  -- Meeting scores/grades (Fathom coaching scorecards)
  CREATE TABLE IF NOT EXISTS meeting_scores (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    template_id TEXT,
    overall_score INTEGER,
    criteria_scores TEXT,
    ai_feedback TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id),
    FOREIGN KEY (template_id) REFERENCES meeting_templates(id)
  );

  CREATE INDEX IF NOT EXISTS idx_highlights_meeting ON highlights(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_enhanced_notes_meeting ON enhanced_notes(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_followup_emails_meeting ON followup_emails(meeting_id);

  -- Insert default meeting templates
  INSERT OR IGNORE INTO meeting_templates (id, name, description, icon, color, prompt_instructions, sections, is_default) VALUES
    ('tpl_1on1', '1:1 Meeting', 'One-on-one check-ins and updates', 'users', '#22c55e',
     'Focus on personal updates, blockers, career growth, and action items. Be supportive and highlight wins.',
     '["Updates", "Blockers", "Goals", "Action Items", "Personal Notes"]', 1),
    ('tpl_standup', 'Daily Standup', 'Quick team sync on progress and blockers', 'coffee', '#f59e0b',
     'Keep it brief. Focus on what was done, what will be done, and any blockers.',
     '["Yesterday", "Today", "Blockers"]', 1),
    ('tpl_sales', 'Sales Call', 'Sales discovery, demo, or closing call', 'dollar-sign', '#6366f1',
     'Identify pain points, budget, timeline, and decision makers. Note objections and next steps.',
     '["Company Info", "Pain Points", "Budget/Timeline", "Decision Makers", "Objections", "Next Steps"]', 1),
    ('tpl_interview', 'Interview', 'Candidate interview session', 'user-check', '#8b5cf6',
     'Assess technical skills, cultural fit, and communication. Note strengths and concerns.',
     '["Background", "Technical Assessment", "Behavioral", "Questions Asked", "Strengths", "Concerns", "Recommendation"]', 1),
    ('tpl_brainstorm', 'Brainstorm', 'Creative ideation session', 'lightbulb', '#ec4899',
     'Capture all ideas without judgment. Group related concepts and identify top priorities.',
     '["Problem Statement", "Ideas", "Top Picks", "Next Steps"]', 1),
    ('tpl_review', 'Project Review', 'Sprint review or project retrospective', 'clipboard', '#14b8a6',
     'Review accomplishments, discuss what went well and what could improve. Capture learnings.',
     '["Accomplishments", "What Went Well", "What Could Improve", "Learnings", "Action Items"]', 1);

  -- Insert default user settings
  INSERT OR IGNORE INTO user_settings (id) VALUES ('default');
`);

// ==================== MEETING FUNCTIONS ====================

export function createMeeting(data: {
  title?: string;
  meeting_url: string;
  platform?: string;
  bot_id?: string;
  contact_id?: string;
  company_id?: string;
  folder_id?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO meetings (id, title, meeting_url, platform, bot_id, contact_id, company_id, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.title || "Untitled Meeting", data.meeting_url, data.platform, data.bot_id, data.contact_id, data.company_id, data.folder_id);
  return id;
}

export function updateMeeting(id: string, data: Partial<{
  title: string;
  recording_id: string;
  status: string;
  ended_at: string;
  bot_id: string;
  duration_seconds: number;
  contact_id: string;
  company_id: string;
  folder_id: string;
  is_shared: number;
  share_token: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  const values = Object.values(data);
  const stmt = db.prepare(`UPDATE meetings SET ${fields} WHERE id = ?`);
  stmt.run(...values, id);
}

export function getMeeting(id: string) {
  return db.prepare("SELECT * FROM meetings WHERE id = ?").get(id);
}

export function getAllMeetings(options?: { limit?: number; offset?: number; status?: string; folder_id?: string; contact_id?: string; company_id?: string }) {
  let query = "SELECT * FROM meetings WHERE 1=1";
  const params: any[] = [];

  if (options?.status) {
    query += " AND status = ?";
    params.push(options.status);
  }
  if (options?.folder_id) {
    query += " AND folder_id = ?";
    params.push(options.folder_id);
  }
  if (options?.contact_id) {
    query += " AND contact_id = ?";
    params.push(options.contact_id);
  }
  if (options?.company_id) {
    query += " AND company_id = ?";
    params.push(options.company_id);
  }

  query += " ORDER BY created_at DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }
  if (options?.offset) {
    query += " OFFSET ?";
    params.push(options.offset);
  }

  return db.prepare(query).all(...params);
}

export function getMeetingByBotId(botId: string) {
  return db.prepare("SELECT * FROM meetings WHERE bot_id = ?").get(botId);
}

export function getMeetingByShareToken(token: string) {
  return db.prepare(`
    SELECT m.* FROM meetings m
    JOIN shares s ON m.id = s.meeting_id
    WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now'))
  `).get(token);
}

export function deleteMeeting(id: string): void {
  db.transaction(() => {
    const children = ["highlights", "keywords", "comments", "notes", "action_items", "shares", "contact_meetings", "speaker_stats", "meeting_tags", "exports", "email_summaries", "enhanced_notes", "followup_emails", "meeting_scores", "transcripts", "participants"];
    for (const table of children) db.prepare(`DELETE FROM ${table} WHERE meeting_id = ?`).run(id);
    db.prepare("UPDATE calendar_events SET meeting_id = NULL WHERE meeting_id = ?").run(id);
    db.prepare("DELETE FROM meetings WHERE id = ?").run(id);
  })();
}

// ==================== PARTICIPANT FUNCTIONS ====================

export function addParticipant(data: {
  meeting_id: string;
  participant_id?: string;
  contact_id?: string;
  name?: string;
  email?: string;
  is_host?: boolean;
  platform?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO participants (id, meeting_id, contact_id, participant_id, name, email, is_host, platform)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.meeting_id, data.contact_id, data.participant_id, data.name, data.email, data.is_host ? 1 : 0, data.platform);
  return id;
}

export function getParticipants(meetingId: string) {
  return db.prepare("SELECT * FROM participants WHERE meeting_id = ?").all(meetingId);
}

export function updateParticipantStats(id: string, talkTime: number, wordCount: number): void {
  db.prepare("UPDATE participants SET talk_time_seconds = talk_time_seconds + ?, word_count = word_count + ? WHERE id = ?").run(talkTime, wordCount, id);
}

// ==================== TRANSCRIPT FUNCTIONS ====================

export function addTranscript(data: {
  meeting_id: string;
  participant_id?: string;
  speaker_name?: string;
  text: string;
  is_final?: boolean;
  sentiment?: string;
  timestamp_relative?: number;
  timestamp_absolute?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO transcripts (id, meeting_id, participant_id, speaker_name, text, is_final, sentiment, timestamp_relative, timestamp_absolute)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.meeting_id,
    data.participant_id,
    data.speaker_name,
    data.text,
    data.is_final !== false ? 1 : 0,
    data.sentiment,
    data.timestamp_relative,
    data.timestamp_absolute
  );
  return id;
}

export function getTranscripts(meetingId: string) {
  return db.prepare(
    "SELECT * FROM transcripts WHERE meeting_id = ? AND is_final = 1 ORDER BY COALESCE(timestamp_relative, 0) ASC, created_at ASC, rowid ASC"
  ).all(meetingId);
}

export function getFullTranscript(meetingId: string): string {
  const transcripts = getTranscripts(meetingId) as any[];
  return transcripts
    .map(t => `${t.speaker_name || "Speaker"}: ${t.text}`)
    .join("\n");
}

// ==================== KEYWORD FUNCTIONS ====================

export function addKeyword(data: {
  meeting_id: string;
  keyword: string;
  category?: string;
  context?: string;
  transcript_id?: string;
  confidence?: number;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO keywords (id, meeting_id, keyword, category, context, transcript_id, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.meeting_id, data.keyword, data.category, data.context, data.transcript_id, data.confidence || 0.8);
  return id;
}

export function getKeywords(meetingId: string) {
  return db.prepare("SELECT * FROM keywords WHERE meeting_id = ? ORDER BY created_at ASC").all(meetingId);
}

export function getKeywordsByCategory(meetingId: string, category: string) {
  return db.prepare("SELECT * FROM keywords WHERE meeting_id = ? AND category = ? ORDER BY created_at ASC").all(meetingId, category);
}

// ==================== NOTES FUNCTIONS ====================

export function addNote(data: {
  meeting_id: string;
  type?: string;
  content: string;
  user_id?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO notes (id, meeting_id, type, content, user_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.meeting_id, data.type || "summary", data.content, data.user_id);
  return id;
}

export function getNotes(meetingId: string) {
  return db.prepare("SELECT * FROM notes WHERE meeting_id = ? ORDER BY created_at DESC").all(meetingId);
}

export function updateNote(id: string, content: string): void {
  db.prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, id);
}

export function deleteNote(id: string): void {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}

// ==================== ACTION ITEMS FUNCTIONS ====================

export function addActionItem(data: {
  meeting_id: string;
  description: string;
  assignee?: string;
  contact_id?: string;
  due_date?: string;
  priority?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO action_items (id, meeting_id, description, assignee, contact_id, due_date, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.meeting_id, data.description, data.assignee, data.contact_id, data.due_date, data.priority || 'medium');
  return id;
}

export function getActionItems(meetingId: string) {
  return db.prepare("SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at ASC").all(meetingId);
}

export function getAllActionItems(options?: { status?: string; assignee?: string; limit?: number }) {
  let query = "SELECT ai.*, m.title as meeting_title FROM action_items ai LEFT JOIN meetings m ON ai.meeting_id = m.id WHERE 1=1";
  const params: any[] = [];

  if (options?.status) {
    query += " AND ai.status = ?";
    params.push(options.status);
  }
  if (options?.assignee) {
    query += " AND ai.assignee = ?";
    params.push(options.assignee);
  }

  query += " ORDER BY ai.due_date ASC, ai.created_at DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  return db.prepare(query).all(...params);
}

export function updateActionItem(id: string, data: Partial<{
  description: string;
  assignee: string;
  due_date: string;
  priority: string;
  status: string;
  completed_at: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  const values = Object.values(data);
  db.prepare(`UPDATE action_items SET ${fields} WHERE id = ?`).run(...values, id);
}

export function deleteActionItem(id: string): void {
  db.prepare("DELETE FROM action_items WHERE id = ?").run(id);
}

// ==================== CRM: COMPANIES ====================

export function createCompany(data: {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  logo_url?: string;
  notes?: string;
  tags?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO companies (id, name, domain, industry, size, website, logo_url, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name, data.domain, data.industry, data.size, data.website, data.logo_url, data.notes, data.tags);
  return id;
}

export function updateCompany(id: string, data: Partial<{
  name: string;
  domain: string;
  industry: string;
  size: string;
  website: string;
  logo_url: string;
  notes: string;
  tags: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  fields && db.prepare(`UPDATE companies SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(data), id);
}

export function getCompany(id: string) {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
}

export function getAllCompanies() {
  return db.prepare("SELECT * FROM companies ORDER BY name ASC").all();
}

export function getCompanyWithStats(id: string) {
  const company = getCompany(id);
  if (!company) return null;

  const contacts = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE company_id = ?").get(id) as any;
  const meetings = db.prepare("SELECT COUNT(*) as count FROM meetings WHERE company_id = ?").get(id) as any;

  return { ...company, contact_count: contacts.count, meeting_count: meetings.count };
}

export function deleteCompany(id: string): void {
  db.prepare("UPDATE contacts SET company_id = NULL WHERE company_id = ?").run(id);
  db.prepare("UPDATE meetings SET company_id = NULL WHERE company_id = ?").run(id);
  db.prepare("DELETE FROM companies WHERE id = ?").run(id);
}

// ==================== CRM: CONTACTS ====================

export function createContact(data: {
  company_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  title?: string;
  avatar_url?: string;
  linkedin_url?: string;
  notes?: string;
  tags?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO contacts (id, company_id, first_name, last_name, email, phone, title, avatar_url, linkedin_url, notes, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.company_id, data.first_name, data.last_name, data.email, data.phone, data.title, data.avatar_url, data.linkedin_url, data.notes, data.tags);
  return id;
}

export function updateContact(id: string, data: Partial<{
  company_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  avatar_url: string;
  linkedin_url: string;
  notes: string;
  tags: string;
  last_contacted_at: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  fields && db.prepare(`UPDATE contacts SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(data), id);
}

export function getContact(id: string) {
  return db.prepare(`
    SELECT c.*, co.name as company_name
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    WHERE c.id = ?
  `).get(id);
}

export function getAllContacts(options?: { company_id?: string; search?: string }) {
  let query = `
    SELECT c.*, co.name as company_name
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (options?.company_id) {
    query += " AND c.company_id = ?";
    params.push(options.company_id);
  }
  if (options?.search) {
    query += " AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)";
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY c.last_name ASC, c.first_name ASC";
  return db.prepare(query).all(...params);
}

export function getContactMeetings(contactId: string) {
  return db.prepare(`
    SELECT m.* FROM meetings m
    WHERE m.contact_id = ?
    OR m.id IN (SELECT meeting_id FROM contact_meetings WHERE contact_id = ?)
    ORDER BY m.created_at DESC
  `).all(contactId, contactId);
}

export function linkContactToMeeting(contactId: string, meetingId: string, role?: string): string {
  const id = uuidv4();
  db.prepare(`
    INSERT OR IGNORE INTO contact_meetings (id, contact_id, meeting_id, role)
    VALUES (?, ?, ?, ?)
  `).run(id, contactId, meetingId, role || 'attendee');
  return id;
}

export function deleteContact(id: string): void {
  db.prepare("DELETE FROM contact_meetings WHERE contact_id = ?").run(id);
  db.prepare("UPDATE meetings SET contact_id = NULL WHERE contact_id = ?").run(id);
  db.prepare("DELETE FROM relationships WHERE contact_id = ?").run(id);
  db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
}

// ==================== COLLABORATION: COMMENTS ====================

export function addComment(data: {
  meeting_id: string;
  transcript_id?: string;
  user_id?: string;
  user_name?: string;
  content: string;
  mentions?: string;
}): string {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO comments (id, meeting_id, transcript_id, user_id, user_name, content, mentions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.meeting_id, data.transcript_id, data.user_id, data.user_name, data.content, data.mentions);
  return id;
}

export function getComments(meetingId: string) {
  return db.prepare("SELECT * FROM comments WHERE meeting_id = ? ORDER BY created_at ASC").all(meetingId);
}

export function updateComment(id: string, content: string): void {
  db.prepare("UPDATE comments SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, id);
}

export function deleteComment(id: string): void {
  db.prepare("DELETE FROM comments WHERE id = ?").run(id);
}

// ==================== COLLABORATION: SHARING ====================

export function createShare(data: {
  meeting_id: string;
  created_by?: string;
  expires_at?: string;
  access_level?: string;
  password?: string;
}): { id: string; token: string } {
  const id = uuidv4();
  const token = crypto.randomBytes(32).toString('hex');
  const password_hash = data.password ? crypto.createHash('sha256').update(data.password).digest('hex') : null;

  db.prepare(`
    INSERT INTO shares (id, meeting_id, token, created_by, expires_at, access_level, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.meeting_id, token, data.created_by, data.expires_at, data.access_level || 'view', password_hash);

  db.prepare("UPDATE meetings SET is_shared = 1, share_token = ? WHERE id = ?").run(token, data.meeting_id);

  return { id, token };
}

export function getShare(token: string) {
  return db.prepare("SELECT * FROM shares WHERE token = ?").get(token);
}

export function incrementShareViewCount(token: string): void {
  db.prepare("UPDATE shares SET view_count = view_count + 1 WHERE token = ?").run(token);
}

export function deleteShare(id: string): void {
  const share = db.prepare("SELECT meeting_id FROM shares WHERE id = ?").get(id) as any;
  db.prepare("DELETE FROM shares WHERE id = ?").run(id);
  if (share) {
    const remaining = db.prepare("SELECT COUNT(*) as count FROM shares WHERE meeting_id = ?").get(share.meeting_id) as any;
    if (remaining.count === 0) {
      db.prepare("UPDATE meetings SET is_shared = 0, share_token = NULL WHERE id = ?").run(share.meeting_id);
    }
  }
}

// ==================== COLLABORATION: FOLDERS ====================

export function createFolder(data: { name: string; parent_id?: string; color?: string; icon?: string }): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO folders (id, name, parent_id, color, icon)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.name, data.parent_id, data.color, data.icon);
  return id;
}

export function getFolders(parentId?: string) {
  if (parentId) {
    return db.prepare("SELECT * FROM folders WHERE parent_id = ? ORDER BY name ASC").all(parentId);
  }
  return db.prepare("SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name ASC").all();
}

export function getAllFolders() {
  return db.prepare("SELECT * FROM folders ORDER BY name ASC").all();
}

export function updateFolder(id: string, data: Partial<{ name: string; parent_id: string; color: string; icon: string }>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  fields && db.prepare(`UPDATE folders SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
}

export function deleteFolder(id: string): void {
  db.prepare("UPDATE meetings SET folder_id = NULL WHERE folder_id = ?").run(id);
  db.prepare("UPDATE folders SET parent_id = NULL WHERE parent_id = ?").run(id);
  db.prepare("DELETE FROM folders WHERE id = ?").run(id);
}

// ==================== COLLABORATION: TAGS ====================

export function createTag(name: string, color?: string): string {
  const id = uuidv4();
  db.prepare("INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)").run(id, name, color || '#6366f1');
  return id;
}

export function getAllTags() {
  return db.prepare("SELECT * FROM tags ORDER BY name ASC").all();
}

export function addTagToMeeting(meetingId: string, tagId: string): void {
  db.prepare("INSERT OR IGNORE INTO meeting_tags (meeting_id, tag_id) VALUES (?, ?)").run(meetingId, tagId);
}

export function removeTagFromMeeting(meetingId: string, tagId: string): void {
  db.prepare("DELETE FROM meeting_tags WHERE meeting_id = ? AND tag_id = ?").run(meetingId, tagId);
}

export function getMeetingTags(meetingId: string) {
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN meeting_tags mt ON t.id = mt.tag_id
    WHERE mt.meeting_id = ?
  `).all(meetingId);
}

export function deleteTag(id: string): void {
  db.prepare("DELETE FROM meeting_tags WHERE tag_id = ?").run(id);
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

// ==================== INTEGRATIONS: WEBHOOKS ====================

export function createWebhook(data: { name?: string; url: string; events: string[]; secret?: string }): string {
  const id = uuidv4();
  const secret = data.secret || crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO webhooks (id, name, url, secret, events)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.name, data.url, secret, JSON.stringify(data.events));
  return id;
}

export function getWebhooks() {
  return db.prepare("SELECT * FROM webhooks WHERE is_active = 1").all();
}

export function getWebhook(id: string) {
  return db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id);
}

export function updateWebhook(id: string, data: Partial<{ name: string; url: string; events: string[]; is_active: number }>): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
  if (data.url !== undefined) { updates.push("url = ?"); values.push(data.url); }
  if (data.events !== undefined) { updates.push("events = ?"); values.push(JSON.stringify(data.events)); }
  if (data.is_active !== undefined) { updates.push("is_active = ?"); values.push(data.is_active); }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE webhooks SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
}

export function logWebhookCall(webhookId: string, event: string, payload: any, responseCode: number, responseBody?: string): void {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO webhook_logs (id, webhook_id, event, payload, response_code, response_body)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, webhookId, event, JSON.stringify(payload), responseCode, responseBody);

  db.prepare("UPDATE webhooks SET last_triggered_at = datetime('now') WHERE id = ?").run(webhookId);

  if (responseCode >= 400) {
    db.prepare("UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?").run(webhookId);
  } else {
    db.prepare("UPDATE webhooks SET failure_count = 0 WHERE id = ?").run(webhookId);
  }
}

export function deleteWebhook(id: string): void {
  db.prepare("DELETE FROM webhook_logs WHERE webhook_id = ?").run(id);
  db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

// ==================== INTEGRATIONS: CALENDAR ====================

export function addCalendarEvent(data: {
  external_id?: string;
  provider?: string;
  title?: string;
  meeting_url?: string;
  start_time: string;
  end_time?: string;
  attendees?: string[];
  auto_join?: boolean;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO calendar_events (id, external_id, provider, title, meeting_url, start_time, end_time, attendees, auto_join)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.external_id, data.provider, data.title, data.meeting_url, data.start_time, data.end_time, JSON.stringify(data.attendees || []), data.auto_join ? 1 : 0);
  return id;
}

export function getUpcomingCalendarEvents(minutes: number = 60) {
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE start_time > datetime('now')
    AND start_time < datetime('now', '+' || ? || ' minutes')
    AND auto_join = 1
    AND meeting_id IS NULL
    ORDER BY start_time ASC
  `).all(minutes);
}

export function linkCalendarEventToMeeting(eventId: string, meetingId: string): void {
  db.prepare("UPDATE calendar_events SET meeting_id = ? WHERE id = ?").run(meetingId, eventId);
}

// ==================== INTEGRATIONS: EXPORTS ====================

export function createExport(meetingId: string, format: string): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO exports (id, meeting_id, format)
    VALUES (?, ?, ?)
  `).run(id, meetingId, format);
  return id;
}

export function updateExport(id: string, status: string, filePath?: string): void {
  if (filePath) {
    db.prepare("UPDATE exports SET status = ?, file_path = ?, completed_at = datetime('now') WHERE id = ?").run(status, filePath, id);
  } else {
    db.prepare("UPDATE exports SET status = ? WHERE id = ?").run(status, id);
  }
}

export function getExport(id: string) {
  return db.prepare("SELECT * FROM exports WHERE id = ?").get(id);
}

// ==================== ANALYTICS ====================

export function getAnalyticsDashboard() {
  const totalMeetings = db.prepare("SELECT COUNT(*) as count FROM meetings").get() as any;
  const totalDuration = db.prepare("SELECT SUM(duration_seconds) as total FROM meetings").get() as any;
  const totalActionItems = db.prepare("SELECT COUNT(*) as count FROM action_items").get() as any;
  const completedActionItems = db.prepare("SELECT COUNT(*) as count FROM action_items WHERE status = 'completed'").get() as any;
  const totalKeywords = db.prepare("SELECT COUNT(*) as count FROM keywords").get() as any;
  const totalContacts = db.prepare("SELECT COUNT(*) as count FROM contacts").get() as any;
  const totalCompanies = db.prepare("SELECT COUNT(*) as count FROM companies").get() as any;

  const recentMeetings = db.prepare(`
    SELECT * FROM meetings
    ORDER BY created_at DESC
    LIMIT 5
  `).all();

  const keywordsByCategory = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM keywords
    GROUP BY category
    ORDER BY count DESC
  `).all();

  const meetingsByDay = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM meetings
    WHERE created_at > datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();

  const upcomingActionItems = db.prepare(`
    SELECT ai.*, m.title as meeting_title
    FROM action_items ai
    LEFT JOIN meetings m ON ai.meeting_id = m.id
    WHERE ai.status = 'pending'
    AND ai.due_date IS NOT NULL
    ORDER BY ai.due_date ASC
    LIMIT 10
  `).all();

  return {
    stats: {
      totalMeetings: totalMeetings.count,
      totalDurationHours: Math.round((totalDuration.total || 0) / 3600 * 10) / 10,
      totalActionItems: totalActionItems.count,
      completedActionItems: completedActionItems.count,
      actionItemCompletionRate: totalActionItems.count > 0
        ? Math.round(completedActionItems.count / totalActionItems.count * 100)
        : 0,
      totalKeywords: totalKeywords.count,
      totalContacts: totalContacts.count,
      totalCompanies: totalCompanies.count
    },
    recentMeetings,
    keywordsByCategory,
    meetingsByDay,
    upcomingActionItems
  };
}

export function getSpeakerStats(meetingId: string) {
  return db.prepare(`
    SELECT
      speaker_name,
      COUNT(*) as utterance_count,
      SUM(LENGTH(text) - LENGTH(REPLACE(text, ' ', '')) + 1) as word_count
    FROM transcripts
    WHERE meeting_id = ? AND is_final = 1
    GROUP BY speaker_name
    ORDER BY word_count DESC
  `).all(meetingId);
}

export function updateDailyStats(): void {
  const today = new Date().toISOString().split('T')[0];

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT m.id) as meeting_count,
      COALESCE(SUM(m.duration_seconds), 0) as total_duration,
      (SELECT COUNT(*) FROM action_items WHERE DATE(created_at) = ?) as action_items_created,
      (SELECT COUNT(*) FROM action_items WHERE DATE(completed_at) = ?) as action_items_completed,
      (SELECT COUNT(*) FROM keywords WHERE DATE(created_at) = ?) as keywords_detected
    FROM meetings m
    WHERE DATE(m.created_at) = ?
  `).get(today, today, today, today) as any;

  db.prepare(`
    INSERT OR REPLACE INTO daily_stats (id, date, meeting_count, total_duration_seconds, action_items_created, action_items_completed, keywords_detected)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), today, stats.meeting_count, stats.total_duration, stats.action_items_created, stats.action_items_completed, stats.keywords_detected);
}

// ==================== SEARCH ====================

export function searchMeetings(query: string) {
  const searchTerm = `%${query}%`;
  return db.prepare(`
    SELECT DISTINCT m.* FROM meetings m
    LEFT JOIN transcripts t ON m.id = t.meeting_id
    LEFT JOIN keywords k ON m.id = k.meeting_id
    LEFT JOIN notes n ON m.id = n.meeting_id
    WHERE m.title LIKE ?
    OR t.text LIKE ?
    OR k.keyword LIKE ?
    OR n.content LIKE ?
    ORDER BY m.created_at DESC
  `).all(searchTerm, searchTerm, searchTerm, searchTerm);
}

export function searchAll(query: string) {
  const searchTerm = `%${query}%`;

  const meetings = db.prepare(`
    SELECT 'meeting' as type, id, title as name, created_at
    FROM meetings WHERE title LIKE ?
    LIMIT 10
  `).all(searchTerm);

  const contacts = db.prepare(`
    SELECT 'contact' as type, id, (first_name || ' ' || last_name) as name, created_at
    FROM contacts WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
    LIMIT 10
  `).all(searchTerm, searchTerm, searchTerm);

  const companies = db.prepare(`
    SELECT 'company' as type, id, name, created_at
    FROM companies WHERE name LIKE ?
    LIMIT 10
  `).all(searchTerm);

  const actionItems = db.prepare(`
    SELECT 'action_item' as type, id, description as name, created_at
    FROM action_items WHERE description LIKE ?
    LIMIT 10
  `).all(searchTerm);

  return [...meetings, ...contacts, ...companies, ...actionItems]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
}

// ==================== HIGHLIGHTS (Fathom clips) ====================

export function addHighlight(data: {
  meeting_id: string;
  transcript_id?: string;
  timestamp_start?: number;
  timestamp_end?: number;
  label?: string;
  note?: string;
  type?: string;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO highlights (id, meeting_id, transcript_id, timestamp_start, timestamp_end, label, note, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.meeting_id, data.transcript_id, data.timestamp_start, data.timestamp_end, data.label, data.note, data.type || 'highlight');
  return id;
}

export function getHighlights(meetingId: string) {
  return db.prepare("SELECT * FROM highlights WHERE meeting_id = ? ORDER BY timestamp_start ASC").all(meetingId);
}

export function updateHighlight(id: string, data: Partial<{ label: string; note: string; type: string }>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  if (fields) {
    db.prepare(`UPDATE highlights SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
  }
}

export function deleteHighlight(id: string): void {
  db.prepare("DELETE FROM highlights WHERE id = ?").run(id);
}

// ==================== MEETING TEMPLATES ====================

export function getMeetingTemplates() {
  return db.prepare("SELECT * FROM meeting_templates ORDER BY name ASC").all();
}

export function getMeetingTemplate(id: string) {
  return db.prepare("SELECT * FROM meeting_templates WHERE id = ?").get(id);
}

export function createMeetingTemplate(data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  prompt_instructions?: string;
  sections?: string[];
  auto_detect_keywords?: string[];
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO meeting_templates (id, name, description, icon, color, prompt_instructions, sections, auto_detect_keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description,
    data.icon,
    data.color || '#6366f1',
    data.prompt_instructions,
    JSON.stringify(data.sections || []),
    JSON.stringify(data.auto_detect_keywords || [])
  );
  return id;
}

export function updateMeetingTemplate(id: string, data: Partial<{
  name: string;
  description: string;
  icon: string;
  color: string;
  prompt_instructions: string;
  sections: string[];
  auto_detect_keywords: string[];
}>): void {
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`);
      values.push(key === 'sections' || key === 'auto_detect_keywords' ? JSON.stringify(value) : value);
    }
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE meeting_templates SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }
}

export function deleteMeetingTemplate(id: string): void {
  db.prepare("DELETE FROM meeting_templates WHERE id = ?").run(id);
}

// ==================== USER SETTINGS ====================

export function getUserSettings() {
  return db.prepare("SELECT * FROM user_settings WHERE id = 'default'").get() as any;
}

export function updateUserSettings(data: Partial<{
  auto_join_enabled: number;
  auto_join_minutes_before: number;
  default_bot_name: string;
  default_template_id: string;
  ngrok_url: string;
  google_calendar_connected: number;
  outlook_connected: number;
  auto_summarize: number;
  auto_detect_action_items: number;
  notification_email: string;
}>): void {
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    db.prepare(`UPDATE user_settings SET ${updates.join(", ")} WHERE id = 'default'`).run(...values);
  }
}

// ==================== AI CONVERSATIONS (Ask DTFM) ====================

export function createAIConversation(title?: string): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO ai_conversations (id, title)
    VALUES (?, ?)
  `).run(id, title || 'New Conversation');
  return id;
}

export function getAIConversations() {
  return db.prepare("SELECT * FROM ai_conversations ORDER BY updated_at DESC").all();
}

export function getAIConversation(id: string) {
  const conversation = db.prepare("SELECT * FROM ai_conversations WHERE id = ?").get(id);
  const messages = db.prepare("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC").all(id);
  return { conversation, messages };
}

export function addAIMessage(data: {
  conversation_id: string;
  role: string;
  content: string;
  meeting_ids?: string[];
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO ai_messages (id, conversation_id, role, content, meeting_ids)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.conversation_id, data.role, data.content, JSON.stringify(data.meeting_ids || []));

  db.prepare("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?").run(data.conversation_id);
  return id;
}

export function deleteAIConversation(id: string): void {
  db.prepare("DELETE FROM ai_messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM ai_conversations WHERE id = ?").run(id);
}

// ==================== ENHANCED NOTES (Granola-style) ====================

export function createEnhancedNote(data: {
  meeting_id: string;
  raw_notes: string;
  enhanced_notes?: string;
  enhancement_prompt?: string;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO enhanced_notes (id, meeting_id, raw_notes, enhanced_notes, enhancement_prompt)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.meeting_id, data.raw_notes, data.enhanced_notes, data.enhancement_prompt);
  return id;
}

export function getEnhancedNotes(meetingId: string) {
  return db.prepare("SELECT * FROM enhanced_notes WHERE meeting_id = ? ORDER BY created_at DESC").all(meetingId);
}

export function updateEnhancedNote(id: string, data: Partial<{
  raw_notes: string;
  enhanced_notes: string;
  enhancement_prompt: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  if (fields) {
    db.prepare(`UPDATE enhanced_notes SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(data), id);
  }
}

// ==================== FOLLOW-UP EMAILS ====================

export function createFollowupEmail(data: {
  meeting_id: string;
  recipient_email?: string;
  recipient_name?: string;
  subject?: string;
  body?: string;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO followup_emails (id, meeting_id, recipient_email, recipient_name, subject, body)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.meeting_id, data.recipient_email, data.recipient_name, data.subject, data.body);
  return id;
}

export function getFollowupEmails(meetingId: string) {
  return db.prepare("SELECT * FROM followup_emails WHERE meeting_id = ? ORDER BY created_at DESC").all(meetingId);
}

export function updateFollowupEmail(id: string, data: Partial<{
  recipient_email: string;
  recipient_name: string;
  subject: string;
  body: string;
  status: string;
  sent_at: string;
}>): void {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
  if (fields) {
    db.prepare(`UPDATE followup_emails SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
  }
}

export function deleteFollowupEmail(id: string): void {
  db.prepare("DELETE FROM followup_emails WHERE id = ?").run(id);
}

// ==================== MEETING SCORES (Fathom coaching) ====================

export function createMeetingScore(data: {
  meeting_id: string;
  template_id?: string;
  overall_score?: number;
  criteria_scores?: any;
  ai_feedback?: string;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO meeting_scores (id, meeting_id, template_id, overall_score, criteria_scores, ai_feedback)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.meeting_id, data.template_id, data.overall_score, JSON.stringify(data.criteria_scores || {}), data.ai_feedback);
  return id;
}

export function getMeetingScore(meetingId: string) {
  return db.prepare("SELECT * FROM meeting_scores WHERE meeting_id = ?").get(meetingId);
}

// ==================== CROSS-MEETING SEARCH (Ask DTFM) ====================

export function searchTranscriptsAcrossMeetings(query: string, limit: number = 50) {
  const searchTerm = `%${query}%`;
  return db.prepare(`
    SELECT t.*, m.title as meeting_title, m.created_at as meeting_date
    FROM transcripts t
    JOIN meetings m ON t.meeting_id = m.id
    WHERE t.text LIKE ?
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(searchTerm, limit);
}

export function getMeetingContext(meetingIds: string[]) {
  const placeholders = meetingIds.map(() => '?').join(',');
  const meetings = db.prepare(`
    SELECT * FROM meetings WHERE id IN (${placeholders})
  `).all(...meetingIds);

  const transcripts = db.prepare(`
    SELECT * FROM transcripts WHERE meeting_id IN (${placeholders}) AND is_final = 1 ORDER BY COALESCE(timestamp_relative, 0) ASC, created_at ASC, rowid ASC
  `).all(...meetingIds);

  const keywords = db.prepare(`
    SELECT * FROM keywords WHERE meeting_id IN (${placeholders})
  `).all(...meetingIds);

  return { meetings, transcripts, keywords };
}

// ==================== CALENDAR AUTO-JOIN ====================

export function getUpcomingMeetingsToJoin(minutesAhead: number = 5) {
  return db.prepare(`
    SELECT * FROM calendar_events
    WHERE auto_join = 1
    AND meeting_id IS NULL
    AND meeting_url IS NOT NULL
    AND datetime(start_time) BETWEEN datetime('now') AND datetime('now', '+' || ? || ' minutes')
    ORDER BY start_time ASC
  `).all(minutesAhead);
}

export function markCalendarEventJoined(eventId: string, meetingId: string): void {
  db.prepare("UPDATE calendar_events SET meeting_id = ? WHERE id = ?").run(meetingId, eventId);
}

export default db;
