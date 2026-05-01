/**
 * =============================================================================
 * DO THIS FOR ME - AI-Powered Meeting Notes Application
 * =============================================================================
 *
 * A local-first meeting notes application inspired by Fathom AI and Granola.
 * Uses Recall.ai for meeting bot/transcription and OpenAI for AI features.
 *
 * ## Key Features (Fathom/Granola Inspired):
 *
 * 1. **Real-time Transcription** - Live meeting transcripts via Recall.ai bot
 * 2. **AI Summaries** - Automatic meeting summaries with action items
 * 3. **Meeting Highlights/Clips** - Save key moments from meetings (Fathom-style)
 * 4. **Meeting Templates** - Pre-built templates for 1:1s, standups, sales calls
 * 5. **Ask DTFM** - Cross-meeting AI chat to search all your meetings (Fathom-style)
 * 6. **Enhanced Notes** - Transform rough notes into polished documents (Granola-style)
 * 7. **Follow-up Emails** - AI-generated follow-up emails from meetings
 * 8. **Meeting Scores** - Coaching scorecards for meeting effectiveness (Fathom-style)
 * 9. **Speaker Analytics** - Track talk time, participation across meetings
 * 10. **Calendar Auto-Join** - Automatically send bot to scheduled meetings
 *
 * ## Architecture:
 * - Express.js server with WebSocket support
 * - SQLite database (better-sqlite3) for local storage
 * - Recall.ai API for meeting bot integration
 * - OpenAI GPT-4 for AI features (optional - works offline too)
 *
 * ## API Endpoints:
 * - /api/meetings - CRUD for meetings
 * - /api/templates - Meeting templates
 * - /api/ai/conversations - Ask DTFM conversations
 * - /api/settings - User preferences
 * - /api/auto-join - Calendar auto-join controls
 * - /send-bot - Send Recall.ai bot to a meeting
 *
 * ## Contributing:
 * See README.md for setup instructions and contribution guidelines.
 *
 * @author Joshua Powers
 * @license MIT
 * =============================================================================
 */

import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import WebSocket from "ws";
import path from "path";
import http from "http";
import fs from "fs";

import {
  AsyncRequestHandler,
  TranscriptDataEvent,
  RecallBotWebSocketMessage,
} from "./types";

import * as db from "./database";
import { analyzeTranscriptLine, analyzeText, DetectedKeyword } from "./keywords";
import {
  generateMeetingSummary,
  generateMeetingTitle,
  isOpenAIConfigured,
  generateOfflineSummary,
  getOpenAI,
} from "./summarizer";

dotenv.config();

const app: express.Express = express();
const expressPort = parseInt(process.env.PORT || "3000");
const websocketPort = parseInt(process.env.WEBSOCKET_PORT || "3456");

const server = http.createServer(app);

// Ensure data directory exists
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// --- UI WebSocket Server Setup ---
const uiWss = new WebSocket.Server({ server, path: "/ui-updates" });
let uiClients = new Set<WebSocket>();

function broadcastToUIClients(logMessage: string, data?: any) {
  const message = JSON.stringify({
    log: logMessage,
    data: data,
    timestamp: new Date().toISOString(),
  });
  uiClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  console.log(`[UI Broadcast] ${logMessage}`, data ? JSON.stringify(data).slice(0, 200) : "");
}

function sendToUIClients(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  uiClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

uiWss.on("connection", (ws) => {
  uiClients.add(ws);
  console.log("UI WebSocket client connected");
  broadcastToUIClients("Connected to Do This For Me server");

  ws.on("close", () => {
    uiClients.delete(ws);
    console.log("UI WebSocket client disconnected");
  });
  ws.on("error", (error) => console.error("UI WebSocket error:", error));
});

// --- Express Setup ---
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());

app.get("/", (req: express.Request, res: express.Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// --- API Endpoints ---

// Get all meetings
app.get("/api/meetings", (req, res) => {
  try {
    const meetings = db.getAllMeetings();
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
});

// Get single meeting with all data
app.get("/api/meetings/:id", (req: express.Request, res: express.Response) => {
  try {
    const meeting = db.getMeeting(req.params.id) as any;
    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }

    const transcripts = db.getTranscripts(req.params.id);
    const keywords = db.getKeywords(req.params.id);
    const actionItems = db.getActionItems(req.params.id);
    const notes = db.getNotes(req.params.id);
    const participants = db.getParticipants(req.params.id);

    res.json({
      ...meeting,
      transcripts,
      keywords,
      actionItems,
      notes,
      participants,
      summary: notes.find((n: any) => n.type === "summary"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meeting data" });
  }
});

// Generate summary for a meeting
app.post("/api/meetings/:id/summarize", async (req: express.Request, res: express.Response) => {
  try {
    const meetingId = req.params.id;
    const fullTranscript = db.getFullTranscript(meetingId);
    const keywords = db.getKeywords(meetingId) as DetectedKeyword[];

    if (!fullTranscript) {
      res.status(400).json({ error: "No transcript available" });
      return;
    }

    let summary;

    if (isOpenAIConfigured()) {
      // Use AI summarization
      summary = await generateMeetingSummary(fullTranscript, keywords);

      // Generate title if not set
      const meeting = db.getMeeting(meetingId) as any;
      if (meeting && meeting.title === "Untitled Meeting") {
        const title = await generateMeetingTitle(fullTranscript);
        db.updateMeeting(meetingId, { title });
      }
    } else {
      // Use offline summarization
      summary = generateOfflineSummary(fullTranscript, keywords);
    }

    // Save summary as a note
    db.addNote({
      meeting_id: meetingId,
      type: "summary",
      content: JSON.stringify(summary),
    });

    // Save action items
    if (summary.actionItems) {
      for (const item of summary.actionItems) {
        db.addActionItem({
          meeting_id: meetingId,
          description: item.description,
          assignee: item.assignee,
          due_date: item.dueDate,
        });
      }
    }

    res.json({ summary });
  } catch (error: any) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: error.message || "Failed to generate summary" });
  }
});

// Search meetings
app.get("/api/search", (req: express.Request, res: express.Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.json([]);
      return;
    }
    const results = db.searchMeetings(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Global search (meetings, contacts, companies, action items)
app.get("/api/search/all", (req: express.Request, res: express.Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.json([]);
      return;
    }
    const results = db.searchAll(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Delete a meeting
app.delete("/api/meetings/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteMeeting(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete meeting" });
  }
});

// Update meeting
app.patch("/api/meetings/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateMeeting(req.params.id, req.body);
    const meeting = db.getMeeting(req.params.id);
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: "Failed to update meeting" });
  }
});

// --- CRM: COMPANIES ---

app.get("/api/companies", (req: express.Request, res: express.Response) => {
  try {
    const companies = db.getAllCompanies();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

app.get("/api/companies/:id", (req: express.Request, res: express.Response) => {
  try {
    const company = db.getCompanyWithStats(req.params.id);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

app.post("/api/companies", (req: express.Request, res: express.Response) => {
  try {
    const id = db.createCompany(req.body);
    const company = db.getCompany(id);
    res.status(201).json(company);
  } catch (error) {
    res.status(500).json({ error: "Failed to create company" });
  }
});

app.patch("/api/companies/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateCompany(req.params.id, req.body);
    const company = db.getCompany(req.params.id);
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: "Failed to update company" });
  }
});

app.delete("/api/companies/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteCompany(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete company" });
  }
});

// --- CRM: CONTACTS ---

app.get("/api/contacts", (req: express.Request, res: express.Response) => {
  try {
    const options: any = {};
    if (req.query.company_id) options.company_id = req.query.company_id;
    if (req.query.search) options.search = req.query.search;
    const contacts = db.getAllContacts(options);
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

app.get("/api/contacts/:id", (req: express.Request, res: express.Response) => {
  try {
    const contact = db.getContact(req.params.id);
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const meetings = db.getContactMeetings(req.params.id);
    res.json({ ...(contact as object), meetings });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch contact" });
  }
});

app.post("/api/contacts", (req: express.Request, res: express.Response) => {
  try {
    const id = db.createContact(req.body);
    const contact = db.getContact(id);
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: "Failed to create contact" });
  }
});

app.patch("/api/contacts/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateContact(req.params.id, req.body);
    const contact = db.getContact(req.params.id);
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: "Failed to update contact" });
  }
});

app.delete("/api/contacts/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteContact(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

app.post("/api/contacts/:id/meetings/:meetingId", (req: express.Request, res: express.Response) => {
  try {
    db.linkContactToMeeting(req.params.id, req.params.meetingId, req.body.role);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to link contact to meeting" });
  }
});

// --- ACTION ITEMS ---

app.get("/api/action-items", (req: express.Request, res: express.Response) => {
  try {
    const options: any = {};
    if (req.query.status) options.status = req.query.status;
    if (req.query.assignee) options.assignee = req.query.assignee;
    if (req.query.limit) options.limit = parseInt(req.query.limit as string);
    const items = db.getAllActionItems(options);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch action items" });
  }
});

app.patch("/api/action-items/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateActionItem(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update action item" });
  }
});

// PUT alias for PATCH (for frontend compatibility)
app.put("/api/action-items/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateActionItem(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update action item" });
  }
});

app.delete("/api/action-items/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteActionItem(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete action item" });
  }
});

// --- ANALYTICS ---

// Simple analytics endpoint for dashboard stats
app.get("/api/analytics", (req: express.Request, res: express.Response) => {
  try {
    const meetings = db.getAllMeetings();
    const actionItems = db.getAllActionItems({});
    const completedItems = actionItems.filter((a: any) => a.status === 'completed');

    res.json({
      total_meetings: meetings.length,
      completed_actions: completedItems.length,
      total_hours: Math.round(meetings.length * 0.5), // Estimate
      avg_score: '--'
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

app.get("/api/analytics/dashboard", (req: express.Request, res: express.Response) => {
  try {
    const dashboard = db.getAnalyticsDashboard();
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

app.get("/api/analytics/meetings/:id/speakers", (req: express.Request, res: express.Response) => {
  try {
    const stats = db.getSpeakerStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch speaker stats" });
  }
});

// --- COLLABORATION: COMMENTS ---

app.get("/api/meetings/:id/comments", (req: express.Request, res: express.Response) => {
  try {
    const comments = db.getComments(req.params.id);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

app.post("/api/meetings/:id/comments", (req: express.Request, res: express.Response) => {
  try {
    const id = db.addComment({
      meeting_id: req.params.id,
      ...req.body,
    });
    res.status(201).json({ id });
  } catch (error) {
    res.status(500).json({ error: "Failed to add comment" });
  }
});

app.patch("/api/comments/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateComment(req.params.id, req.body.content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update comment" });
  }
});

app.delete("/api/comments/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteComment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// --- COLLABORATION: SHARING ---

app.post("/api/meetings/:id/share", (req: express.Request, res: express.Response) => {
  try {
    const share = db.createShare({
      meeting_id: req.params.id,
      ...req.body,
    });
    res.status(201).json(share);
  } catch (error) {
    res.status(500).json({ error: "Failed to create share link" });
  }
});

app.get("/api/share/:token", (req: express.Request, res: express.Response) => {
  try {
    const meeting = db.getMeetingByShareToken(req.params.token);
    if (!meeting) {
      res.status(404).json({ error: "Share link not found or expired" });
      return;
    }
    db.incrementShareViewCount(req.params.token);

    // Return meeting with limited data for shared view
    const transcripts = db.getTranscripts((meeting as any).id);
    const keywords = db.getKeywords((meeting as any).id);
    const notes = db.getNotes((meeting as any).id);

    res.json({
      ...(meeting as object),
      transcripts,
      keywords,
      summary: notes.find((n: any) => n.type === "summary"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch shared meeting" });
  }
});

app.delete("/api/shares/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteShare(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete share link" });
  }
});

// --- COLLABORATION: FOLDERS ---

app.get("/api/folders", (req: express.Request, res: express.Response) => {
  try {
    const folders = db.getAllFolders();
    res.json(folders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});

app.post("/api/folders", (req: express.Request, res: express.Response) => {
  try {
    const id = db.createFolder(req.body);
    res.status(201).json({ id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create folder" });
  }
});

app.patch("/api/folders/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateFolder(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update folder" });
  }
});

app.delete("/api/folders/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteFolder(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

// --- COLLABORATION: TAGS ---

app.get("/api/tags", (req: express.Request, res: express.Response) => {
  try {
    const tags = db.getAllTags();
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

app.post("/api/tags", (req: express.Request, res: express.Response) => {
  try {
    const id = db.createTag(req.body.name, req.body.color);
    res.status(201).json({ id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create tag" });
  }
});

app.delete("/api/tags/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteTag(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

app.post("/api/meetings/:meetingId/tags/:tagId", (req: express.Request, res: express.Response) => {
  try {
    db.addTagToMeeting(req.params.meetingId, req.params.tagId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add tag to meeting" });
  }
});

app.delete("/api/meetings/:meetingId/tags/:tagId", (req: express.Request, res: express.Response) => {
  try {
    db.removeTagFromMeeting(req.params.meetingId, req.params.tagId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove tag from meeting" });
  }
});

app.get("/api/meetings/:id/tags", (req: express.Request, res: express.Response) => {
  try {
    const tags = db.getMeetingTags(req.params.id);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch meeting tags" });
  }
});

// --- INTEGRATIONS: WEBHOOKS ---

app.get("/api/webhooks", (req: express.Request, res: express.Response) => {
  try {
    const webhooks = db.getWebhooks();
    res.json(webhooks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch webhooks" });
  }
});

app.post("/api/webhooks", (req: express.Request, res: express.Response) => {
  try {
    const id = db.createWebhook(req.body);
    const webhook = db.getWebhook(id);
    res.status(201).json(webhook);
  } catch (error) {
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

app.patch("/api/webhooks/:id", (req: express.Request, res: express.Response) => {
  try {
    db.updateWebhook(req.params.id, req.body);
    const webhook = db.getWebhook(req.params.id);
    res.json(webhook);
  } catch (error) {
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

app.delete("/api/webhooks/:id", (req: express.Request, res: express.Response) => {
  try {
    db.deleteWebhook(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

// --- INTEGRATIONS: EXPORTS ---

app.post("/api/meetings/:id/export", async (req: express.Request, res: express.Response) => {
  try {
    const { format } = req.body;
    const meetingId = req.params.id;
    const meeting = db.getMeeting(meetingId) as any;

    if (!meeting) {
      res.status(404).json({ error: "Meeting not found" });
      return;
    }

    const transcripts = db.getTranscripts(meetingId);
    const keywords = db.getKeywords(meetingId);
    const notes = db.getNotes(meetingId) as any[];
    const summary = notes.find((n: any) => n.type === "summary") as any;

    let content = "";
    let filename = "";
    let contentType = "";

    if (format === "txt") {
      content = `# ${meeting.title}\n\nDate: ${meeting.created_at}\n\n## Transcript\n\n`;
      content += transcripts.map((t: any) => `${t.speaker_name}: ${t.text}`).join("\n");
      if (summary) {
        const summaryData = JSON.parse(summary.content);
        content += `\n\n## Summary\n\n${summaryData.summary || ""}`;
        if (summaryData.actionItems?.length) {
          content += "\n\n## Action Items\n\n";
          content += summaryData.actionItems.map((a: any) => `- ${a.description}`).join("\n");
        }
      }
      filename = `${meeting.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
      contentType = "text/plain";
    } else if (format === "json") {
      content = JSON.stringify({
        meeting,
        transcripts,
        keywords,
        summary: summary ? JSON.parse(summary.content) : null,
      }, null, 2);
      filename = `${meeting.title.replace(/[^a-z0-9]/gi, '_')}.json`;
      contentType = "application/json";
    } else if (format === "md") {
      content = `# ${meeting.title}\n\n**Date:** ${meeting.created_at}\n**Platform:** ${meeting.platform || "Unknown"}\n\n---\n\n## Transcript\n\n`;
      content += transcripts.map((t: any) => `**${t.speaker_name}:** ${t.text}`).join("\n\n");
      if (keywords.length) {
        content += "\n\n---\n\n## Keywords Detected\n\n";
        const byCategory: any = {};
        keywords.forEach((k: any) => {
          if (!byCategory[k.category]) byCategory[k.category] = [];
          byCategory[k.category].push(k.keyword);
        });
        for (const [cat, kws] of Object.entries(byCategory)) {
          content += `### ${cat.replace(/_/g, " ").toUpperCase()}\n\n`;
          content += (kws as string[]).map(k => `- ${k}`).join("\n") + "\n\n";
        }
      }
      if (summary) {
        const summaryData = JSON.parse(summary.content);
        content += "\n---\n\n## AI Summary\n\n" + (summaryData.summary || "");
        if (summaryData.keyPoints?.length) {
          content += "\n\n### Key Points\n\n" + summaryData.keyPoints.map((p: string) => `- ${p}`).join("\n");
        }
        if (summaryData.actionItems?.length) {
          content += "\n\n### Action Items\n\n";
          content += summaryData.actionItems.map((a: any) => {
            let item = `- ${a.description}`;
            if (a.assignee) item += ` (${a.assignee})`;
            if (a.dueDate) item += ` - Due: ${a.dueDate}`;
            return item;
          }).join("\n");
        }
        if (summaryData.decisions?.length) {
          content += "\n\n### Decisions\n\n" + summaryData.decisions.map((d: string) => `- ${d}`).join("\n");
        }
      }
      filename = `${meeting.title.replace(/[^a-z0-9]/gi, '_')}.md`;
      contentType = "text/markdown";
    } else {
      res.status(400).json({ error: "Unsupported format. Use txt, json, or md." });
      return;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: "Failed to export meeting" });
  }
});

// --- INTEGRATIONS: CALENDAR ---

app.get("/api/calendar", (req: express.Request, res: express.Response) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 60;
    const events = db.getUpcomingCalendarEvents(minutes);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch calendar events" });
  }
});

app.post("/api/calendar", (req: express.Request, res: express.Response) => {
  try {
    const id = db.addCalendarEvent(req.body);
    res.status(201).json({ id });
  } catch (error) {
    res.status(500).json({ error: "Failed to add calendar event" });
  }
});

// --- Recall.ai Bot Endpoint ---
const sendBotHandler: AsyncRequestHandler = async (req, res, next) => {
  const { meeting_url, bot_name, recording_config } = req.body;
  const apiKey = process.env.RECALL_API_KEY;

  if (!meeting_url) {
    broadcastToUIClients("Error: meeting_url is required");
    return res.status(400).json({ error: "meeting_url is required" });
  }
  if (!apiKey) {
    broadcastToUIClients("Error: RECALL_API_KEY not set");
    return res.status(500).json({ error: "RECALL_API_KEY not configured" });
  }

  try {
    // Determine platform from URL
    let platform = "unknown";
    if (meeting_url.includes("meet.google.com")) platform = "google_meet";
    else if (meeting_url.includes("zoom.us")) platform = "zoom";
    else if (meeting_url.includes("teams.microsoft.com")) platform = "teams";

    // Create meeting in database
    const meetingId = db.createMeeting({
      meeting_url,
      platform,
      title: "Untitled Meeting",
    });

    const recallApiUrl = "https://us-east-1.recall.ai/api/v1/bot";

    const payload: any = {
      meeting_url: meeting_url,
      bot_name: bot_name || "Do This For Me",
    };

    if (recording_config) {
      payload.recording_config = recording_config;
    }

    broadcastToUIClients("Sending bot to meeting...", { meeting_url });

    const response = await axios.post(recallApiUrl, payload, {
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // Update meeting with bot ID
    db.updateMeeting(meetingId, { bot_id: response.data.id });

    broadcastToUIClients("Bot sent successfully", { botId: response.data.id });

    // Send meeting update to UI
    const updatedMeeting = db.getMeeting(meetingId);
    sendToUIClients("meeting_update", {
      id: meetingId,
      ...(updatedMeeting as object),
    });

    res.status(response.status).json({
      ...response.data,
      meeting_id: meetingId,
    });
  } catch (error: any) {
    const errorMsg = error.response?.data || error.message;
    console.error("Error calling Recall.ai API:", errorMsg);
    broadcastToUIClients("Error sending bot", errorMsg);

    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: "Failed to send bot" });
  }
};

app.post("/send-bot", sendBotHandler);

// =============================================================================
// FATHOM/GRANOLA-INSPIRED FEATURES API ROUTES
// =============================================================================
//
// These features are inspired by two leading meeting note applications:
//
// FATHOM AI (fathom.video) - Features we've implemented:
// - Meeting Highlights/Clips: Save and share key moments from meetings
// - Ask Fathom (Ask DTFM): AI chat across all your meetings
// - Coaching Scorecards: Meeting effectiveness scores and feedback
// - Auto-Join: Automatically send bot to scheduled meetings
//
// GRANOLA (granola.so) - Features we've implemented:
// - Enhanced Notes: Transform rough notes into polished documents
// - Meeting Templates: Pre-built structures for different meeting types
// - Cross-meeting Intelligence: Search and reference past meetings
//
// TODO for contributors:
// - [ ] Add video clip extraction from recordings
// - [ ] Implement team sharing and permissions
// - [ ] Add Slack/Teams integration for notifications
// - [ ] Build Chrome extension for calendar detection
// =============================================================================

/**
 * HIGHLIGHTS API (Fathom-style Meeting Clips)
 *
 * Allows users to mark and save key moments from meetings.
 * Each highlight can have a label, note, and timestamp range.
 *
 * POST /api/meetings/:meetingId/highlights - Create a new highlight
 * GET /api/meetings/:meetingId/highlights - Get all highlights for a meeting
 * DELETE /api/highlights/:id - Remove a highlight
 */
app.get("/api/meetings/:meetingId/highlights", (req, res) => {
  const highlights = db.getHighlights(req.params.meetingId);
  res.json(highlights);
});

app.post("/api/meetings/:meetingId/highlights", (req, res) => {
  const { transcript_id, label, note, timestamp_start, timestamp_end, type } = req.body;
  const id = db.addHighlight({
    meeting_id: req.params.meetingId,
    transcript_id,
    label,
    note,
    timestamp_start,
    timestamp_end,
    type,
  });
  res.json({ id });
});

app.delete("/api/highlights/:id", (req, res) => {
  db.deleteHighlight(req.params.id);
  res.json({ success: true });
});

/**
 * MEETING TEMPLATES API
 *
 * Pre-built meeting structures for different meeting types.
 * Default templates include: 1:1, Standup, Sales Call, Interview, Brainstorm, Review
 *
 * Each template can have:
 * - Custom sections (e.g., "Action Items", "Decisions", "Follow-ups")
 * - AI prompt instructions for customized summaries
 * - Auto-detect keywords specific to the meeting type
 *
 * POST /api/templates - Create a new template
 * GET /api/templates - List all templates
 * PUT /api/templates/:id - Update a template
 * DELETE /api/templates/:id - Remove a template
 */
app.get("/api/templates", (req, res) => {
  const templates = db.getMeetingTemplates();
  res.json(templates);
});

app.post("/api/templates", (req, res) => {
  const { name, description, icon, color, prompt_instructions, sections, auto_detect_keywords } = req.body;
  const id = db.createMeetingTemplate({
    name,
    description,
    icon,
    color,
    prompt_instructions,
    sections,
    auto_detect_keywords,
  });
  res.json({ id });
});

app.put("/api/templates/:id", (req, res) => {
  const { name, description, icon, color, prompt_instructions, sections, auto_detect_keywords } = req.body;
  db.updateMeetingTemplate(req.params.id, { name, description, icon, color, prompt_instructions, sections, auto_detect_keywords });
  res.json({ success: true });
});

app.delete("/api/templates/:id", (req, res) => {
  db.deleteMeetingTemplate(req.params.id);
  res.json({ success: true });
});

/**
 * USER SETTINGS API
 *
 * Global application preferences including:
 * - auto_join_enabled: Automatically send bot to calendar meetings
 * - auto_join_minutes_before: How early to join (default: 1 min)
 * - default_bot_name: Name shown in meetings
 * - default_template_id: Default meeting template
 * - auto_summarize: Generate summaries automatically
 * - auto_detect_action_items: Extract action items from transcripts
 *
 * GET /api/settings - Get current settings
 * PUT /api/settings - Update settings
 */
app.get("/api/settings", (req, res) => {
  const settings = db.getUserSettings();
  res.json(settings);
});

app.put("/api/settings", (req, res) => {
  db.updateUserSettings(req.body);
  res.json({ success: true });
});

/**
 * ASK DTFM API (Fathom's "Ask Fathom" Feature)
 *
 * Cross-meeting AI chat that searches all your meeting transcripts.
 * Ask questions like:
 * - "What did we decide about the pricing?"
 * - "When is the next product launch?"
 * - "What action items were assigned to Sarah?"
 *
 * The AI will search across all meetings and provide answers with context.
 *
 * POST /api/ai/conversations - Start a new conversation
 * GET /api/ai/conversations - List all conversations
 * GET /api/ai/conversations/:id/messages - Get messages in a conversation
 * POST /api/ai/conversations/:id/messages - Send a message and get AI response
 */
app.get("/api/ai/conversations", (req, res) => {
  const conversations = db.getAIConversations();
  res.json(conversations);
});

app.post("/api/ai/conversations", async (req, res) => {
  const { title } = req.body;
  const id = db.createAIConversation(title);
  res.json({ id });
});

app.get("/api/ai/conversations/:id/messages", (req, res) => {
  const conversation = db.getAIConversation(req.params.id);
  res.json(conversation.messages);
});

app.post("/api/ai/conversations/:id/messages", (async (req, res) => {
  const { content, meeting_ids } = req.body;
  const conversationId = req.params.id;

  // Save user message
  db.addAIMessage({
    conversation_id: conversationId,
    role: "user",
    content,
  });

  if (!isOpenAIConfigured()) {
    const assistantId = db.addAIMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: "OpenAI is not configured. Please add your API key to use Ask DTFM.",
    });
    res.json({ id: assistantId, content: "OpenAI is not configured." });
    return;
  }

  try {
    // Search across meetings for relevant context
    const keywords = content.split(/\s+/).filter((w: string) => w.length > 3);
    let context = "";

    if (meeting_ids && meeting_ids.length > 0) {
      // Search within specific meetings
      for (const meetingId of meeting_ids) {
        const meeting = db.getMeeting(meetingId) as any;
        const transcripts = db.getTranscripts(meetingId);
        if (meeting && transcripts.length > 0) {
          context += `\n\n--- Meeting: ${meeting.title} (${meeting.created_at}) ---\n`;
          context += transcripts.slice(0, 50).map((t: any) => `${t.speaker_name}: ${t.text}`).join("\n");
        }
      }
    } else {
      // Search all meetings
      for (const keyword of keywords.slice(0, 5)) {
        const results = db.searchTranscriptsAcrossMeetings(keyword) as any[];
        for (const result of results.slice(0, 10)) {
          context += `\n[${result.meeting_title}] ${result.speaker_name}: ${result.text}`;
        }
      }
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are Ask DTFM, an AI assistant that helps users find information across their meeting transcripts.
You have access to meeting transcripts and can answer questions about what was discussed.
Be concise but thorough. Reference specific meetings and speakers when relevant.
If you can't find relevant information, say so clearly.

Meeting Context:
${context || "No relevant meeting data found."}`,
        },
        { role: "user", content },
      ],
      max_tokens: 1000,
    });

    const assistantContent = completion.choices[0].message.content || "I couldn't generate a response.";
    const assistantId = db.addAIMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
    });

    res.json({ id: assistantId, content: assistantContent });
  } catch (error: any) {
    console.error("Ask DTFM error:", error.message);
    const errorId = db.addAIMessage({
      conversation_id: conversationId,
      role: "assistant",
      content: `Error: ${error.message}`,
    });
    res.status(500).json({ id: errorId, error: error.message });
  }
}) as express.RequestHandler);

/**
 * ENHANCED NOTES API (Granola-style)
 *
 * Transform rough meeting notes into polished, professional documents.
 * Inspired by Granola's approach where you type rough notes during the
 * meeting and AI polishes them afterward using the transcript context.
 *
 * Features:
 * - Takes raw/rough notes as input
 * - Uses meeting transcript for context
 * - Produces clean, organized output
 * - Supports custom enhancement prompts
 *
 * POST /api/meetings/:meetingId/enhanced-notes - Create enhanced notes
 * GET /api/meetings/:meetingId/enhanced-notes - Get all enhanced notes
 * PUT /api/enhanced-notes/:id - Update notes
 */
app.get("/api/meetings/:meetingId/enhanced-notes", (req, res) => {
  const notes = db.getEnhancedNotes(req.params.meetingId);
  res.json(notes);
});

app.post("/api/meetings/:meetingId/enhanced-notes", async (req, res) => {
  const { raw_notes, enhancement_prompt } = req.body;
  const meetingId = req.params.meetingId;

  // Get meeting context
  const meeting = db.getMeeting(meetingId) as any;
  const transcripts = db.getTranscripts(meetingId);

  let enhancedNotes = raw_notes;

  if (isOpenAIConfigured()) {
    try {
      const transcriptText = transcripts.map((t: any) => `${t.speaker_name}: ${t.text}`).join("\n");

      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a meeting notes enhancer. Take rough notes and meeting transcript, and produce polished, professional notes.
Preserve all key information. Organize clearly. Add context from the transcript where helpful.
${enhancement_prompt || ""}`,
          },
          {
            role: "user",
            content: `Meeting: ${meeting?.title || "Untitled"}\n\nRough Notes:\n${raw_notes}\n\nTranscript (for context):\n${transcriptText.slice(0, 8000)}`,
          },
        ],
        max_tokens: 2000,
      });

      enhancedNotes = completion.choices[0].message.content || raw_notes;
    } catch (error: any) {
      console.error("Enhanced notes error:", error.message);
    }
  }

  const id = db.createEnhancedNote({
    meeting_id: meetingId,
    raw_notes,
    enhanced_notes: enhancedNotes,
    enhancement_prompt,
  });

  res.json({ id, enhanced_notes: enhancedNotes });
});

app.put("/api/enhanced-notes/:id", (req, res) => {
  const { raw_notes, enhanced_notes } = req.body;
  db.updateEnhancedNote(req.params.id, { raw_notes, enhanced_notes });
  res.json({ success: true });
});

/**
 * FOLLOW-UP EMAILS API
 *
 * Generate professional follow-up emails from meeting content.
 * AI analyzes the meeting summary, action items, and transcript
 * to create a ready-to-send email.
 *
 * Options:
 * - recipient_type: "client", "team", "manager", "general"
 * - tone: "formal", "professional", "casual", "friendly"
 *
 * The generated email includes:
 * - Appropriate greeting
 * - Meeting summary
 * - Action items with owners
 * - Next steps
 * - Professional sign-off
 *
 * POST /api/meetings/:meetingId/followup-emails - Generate email
 * GET /api/meetings/:meetingId/followup-emails - List saved emails
 * PUT /api/followup-emails/:id - Edit email
 */
app.get("/api/meetings/:meetingId/followup-emails", (req, res) => {
  const emails = db.getFollowupEmails(req.params.meetingId);
  res.json(emails);
});

app.post("/api/meetings/:meetingId/followup-emails", async (req, res) => {
  const { recipient_type, tone } = req.body;
  const meetingId = req.params.meetingId;

  const meeting = db.getMeeting(meetingId) as any;
  const transcripts = db.getTranscripts(meetingId);
  const notes = db.getNotes(meetingId) as any[];
  const summary = notes.find((n: any) => n.type === "summary") as any;

  let subject = `Follow-up: ${meeting?.title || "Our Meeting"}`;
  let body = "Thank you for meeting with me. Here are the key points from our discussion...";

  if (isOpenAIConfigured()) {
    try {
      const summaryData = summary ? JSON.parse(summary.content) : null;
      const transcriptText = transcripts.map((t: any) => `${t.speaker_name}: ${t.text}`).join("\n");

      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Generate a professional follow-up email for a meeting.
Recipient type: ${recipient_type || "general"}
Tone: ${tone || "professional"}
Include: greeting, summary of key points, action items with owners, next steps, sign-off.
Return JSON with "subject" and "body" fields.`,
          },
          {
            role: "user",
            content: `Meeting: ${meeting?.title}\nDate: ${meeting?.created_at}\n\nSummary:\n${summaryData?.summary || "No summary available"}\n\nAction Items:\n${summaryData?.actionItems?.map((a: any) => `- ${a.description} (${a.assignee || "Unassigned"})`).join("\n") || "None"}\n\nTranscript excerpt:\n${transcriptText.slice(0, 4000)}`,
          },
        ],
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const emailData = JSON.parse(completion.choices[0].message.content || "{}");
      subject = emailData.subject || subject;
      body = emailData.body || body;
    } catch (error: any) {
      console.error("Follow-up email error:", error.message);
    }
  }

  const id = db.createFollowupEmail({
    meeting_id: meetingId,
    subject,
    body,
  });

  res.json({ id, subject, body });
});

app.put("/api/followup-emails/:id", (req, res) => {
  const { subject, body, status } = req.body;
  db.updateFollowupEmail(req.params.id, { subject, body, status });
  res.json({ success: true });
});

/**
 * MEETING SCORES API (Fathom-style Coaching Scorecards)
 *
 * Analyze meeting effectiveness and provide coaching feedback.
 * Scores are calculated both algorithmically and via AI analysis.
 *
 * Metrics scored (0-100):
 * - talk_ratio: Balance of speaking time between participants
 * - engagement: How engaged participants were in discussion
 * - clarity: How clear and organized communication was
 * - action_items: How well action items were defined
 * - overall: Overall meeting effectiveness
 *
 * Also provides 2-3 sentences of coaching feedback.
 *
 * POST /api/meetings/:meetingId/scores - Generate scores for a meeting
 * GET /api/meetings/:meetingId/scores - Get existing scores
 */
app.get("/api/meetings/:meetingId/scores", (req, res) => {
  const score = db.getMeetingScore(req.params.meetingId);
  res.json(score);
});

app.post("/api/meetings/:meetingId/scores", async (req, res) => {
  const meetingId = req.params.meetingId;
  const meeting = db.getMeeting(meetingId) as any;
  const transcripts = db.getTranscripts(meetingId);

  let scores = {
    talk_ratio: 50,
    engagement: 50,
    clarity: 50,
    action_items: 50,
    overall: 50,
  };
  let feedback = "Meeting analysis not available.";

  if (isOpenAIConfigured() && transcripts.length > 0) {
    try {
      const transcriptText = transcripts.map((t: any) => `${t.speaker_name}: ${t.text}`).join("\n");

      // Calculate talk ratio
      const speakerStats: Record<string, number> = {};
      transcripts.forEach((t: any) => {
        speakerStats[t.speaker_name] = (speakerStats[t.speaker_name] || 0) + t.text.length;
      });
      const totalChars = Object.values(speakerStats).reduce((a, b) => a + b, 0);
      const speakerCount = Object.keys(speakerStats).length;
      const avgChars = totalChars / speakerCount;
      const variance = Object.values(speakerStats).reduce((sum, chars) => sum + Math.abs(chars - avgChars), 0) / speakerCount;
      scores.talk_ratio = Math.max(0, Math.min(100, 100 - (variance / avgChars * 50)));

      const openai = getOpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Analyze this meeting transcript and provide coaching feedback.
Return JSON with:
- engagement: 0-100 score for participant engagement
- clarity: 0-100 score for communication clarity
- action_items: 0-100 score for action item definition
- overall: 0-100 overall meeting effectiveness
- feedback: 2-3 sentences of coaching feedback`,
          },
          {
            role: "user",
            content: transcriptText.slice(0, 8000),
          },
        ],
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const analysis = JSON.parse(completion.choices[0].message.content || "{}");
      scores.engagement = analysis.engagement || 50;
      scores.clarity = analysis.clarity || 50;
      scores.action_items = analysis.action_items || 50;
      scores.overall = analysis.overall || 50;
      feedback = analysis.feedback || feedback;
    } catch (error: any) {
      console.error("Meeting scores error:", error.message);
    }
  }

  const id = db.createMeetingScore({
    meeting_id: meetingId,
    overall_score: scores.overall,
    criteria_scores: scores,
    ai_feedback: feedback,
  });

  res.json({ id, scores, feedback });
});

/**
 * SPEAKER ANALYTICS API
 *
 * Track and analyze speaking patterns across meetings.
 * Useful for understanding participation and engagement.
 *
 * Returns per-speaker statistics:
 * - total_words: Total words spoken across all meetings
 * - total_time: Estimated talk time in seconds
 * - meeting_count: Number of meetings participated in
 * - avg_words_per_meeting: Average words per meeting
 *
 * Query parameters:
 * - meeting_id: Analyze specific meeting only
 * - date_from: Filter meetings from this date
 * - date_to: Filter meetings until this date
 *
 * GET /api/analytics/speakers - Get speaker statistics
 */
app.get("/api/analytics/speakers", (req, res) => {
  const { meeting_id, date_from, date_to } = req.query;

  let meetings: any[];
  if (meeting_id) {
    const meeting = db.getMeeting(meeting_id as string);
    meetings = meeting ? [meeting] : [];
  } else {
    meetings = db.getAllMeetings();
    if (date_from) {
      meetings = meetings.filter((m: any) => new Date(m.created_at) >= new Date(date_from as string));
    }
    if (date_to) {
      meetings = meetings.filter((m: any) => new Date(m.created_at) <= new Date(date_to as string));
    }
  }

  const speakerStats: Record<string, {
    total_words: number;
    total_time: number;
    meeting_count: number;
    avg_words_per_meeting: number;
  }> = {};

  for (const meeting of meetings) {
    const transcripts = db.getTranscripts((meeting as any).id);
    for (const t of transcripts) {
      const transcript = t as any;
      const speaker = transcript.speaker_name;
      const wordCount = transcript.text.split(/\s+/).length;

      if (!speakerStats[speaker]) {
        speakerStats[speaker] = { total_words: 0, total_time: 0, meeting_count: 0, avg_words_per_meeting: 0 };
      }
      speakerStats[speaker].total_words += wordCount;
      speakerStats[speaker].total_time += wordCount * 0.4; // Rough estimate: 150 wpm
    }
  }

  // Calculate meeting participation
  for (const speaker in speakerStats) {
    speakerStats[speaker].meeting_count = meetings.filter((m: any) => {
      const transcripts = db.getTranscripts(m.id);
      return transcripts.some((t: any) => t.speaker_name === speaker);
    }).length;
    speakerStats[speaker].avg_words_per_meeting =
      speakerStats[speaker].meeting_count > 0
        ? Math.round(speakerStats[speaker].total_words / speakerStats[speaker].meeting_count)
        : 0;
  }

  res.json(speakerStats);
});

/**
 * AUTO-JOIN SCHEDULER (Fathom-style Calendar Integration)
 *
 * Automatically sends the Recall.ai bot to scheduled meetings.
 * Polls calendar events and joins meetings based on user settings.
 *
 * How it works:
 * 1. Scheduler runs every 30 seconds when enabled
 * 2. Checks for upcoming calendar events with meeting URLs
 * 3. Sends bot to meetings X minutes before start time
 * 4. Creates meeting record and links to calendar event
 *
 * Settings (via /api/settings):
 * - auto_join_enabled: Enable/disable auto-join
 * - auto_join_minutes_before: How early to join (default: 1 min)
 * - default_bot_name: Bot name shown in meetings
 *
 * API:
 * POST /api/auto-join/start - Enable auto-join
 * POST /api/auto-join/stop - Disable auto-join
 *
 * TODO for contributors:
 * - [ ] Add Google Calendar OAuth integration
 * - [ ] Add Outlook/Microsoft 365 integration
 * - [ ] Add meeting URL detection from calendar descriptions
 * - [ ] Add per-meeting auto-join toggle
 */
let autoJoinInterval: NodeJS.Timeout | null = null;

function startAutoJoinScheduler() {
  if (autoJoinInterval) return;

  autoJoinInterval = setInterval(async () => {
    try {
      const settings = db.getUserSettings();
      if (!settings.auto_join_enabled) return;

      const minutesBefore = settings.auto_join_minutes_before || 1;
      const upcomingMeetings = db.getUpcomingMeetingsToJoin(minutesBefore);

      for (const event of upcomingMeetings) {
        const calendarEvent = event as any;
        if (calendarEvent.meeting_url) {
          console.log(`Auto-joining meeting: ${calendarEvent.title}`);
          broadcastToUIClients("Auto-joining meeting", { title: calendarEvent.title });

          // Create meeting and send bot
          const meetingId = db.createMeeting({
            meeting_url: calendarEvent.meeting_url,
            title: calendarEvent.title || "Scheduled Meeting",
            platform: calendarEvent.platform,
          });

          // Mark as joined
          db.markCalendarEventJoined(calendarEvent.id, meetingId);

          // Send bot (simulated - would need real implementation)
          try {
            const response = await axios.post(
              "https://us-west-2.recall.ai/api/v1/bot",
              {
                meeting_url: calendarEvent.meeting_url,
                bot_name: settings.default_bot_name || "Do This For Me",
                transcription_options: { provider: "default" },
                real_time_transcription: {
                  destination_url: `${process.env.WEBHOOK_URL || "http://localhost:" + websocketPort}`,
                },
              },
              {
                headers: {
                  Authorization: `Token ${process.env.RECALL_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );

            db.updateMeeting(meetingId, {
              bot_id: response.data.id,
              status: "bot_sent",
            });

            broadcastToUIClients("Bot auto-sent", { meeting: calendarEvent.title, bot_id: response.data.id });
          } catch (error: any) {
            console.error("Auto-join bot error:", error.message);
            broadcastToUIClients("Auto-join failed", { meeting: calendarEvent.title, error: error.message });
          }
        }
      }
    } catch (error: any) {
      console.error("Auto-join scheduler error:", error.message);
    }
  }, 30000); // Check every 30 seconds

  console.log("Auto-join scheduler started");
}

function stopAutoJoinScheduler() {
  if (autoJoinInterval) {
    clearInterval(autoJoinInterval);
    autoJoinInterval = null;
    console.log("Auto-join scheduler stopped");
  }
}

// Start auto-join on server startup
const settings = db.getUserSettings();
if (settings.auto_join_enabled) {
  startAutoJoinScheduler();
}

app.post("/api/auto-join/start", (req, res) => {
  db.updateUserSettings({ auto_join_enabled: 1 });
  startAutoJoinScheduler();
  res.json({ success: true, message: "Auto-join scheduler started" });
});

app.post("/api/auto-join/stop", (req, res) => {
  db.updateUserSettings({ auto_join_enabled: 0 });
  stopAutoJoinScheduler();
  res.json({ success: true, message: "Auto-join scheduler stopped" });
});

// =============================================================================
// END FATHOM/GRANOLA FEATURES
// =============================================================================

// --- WebSocket Server for Recall.ai Bot ---
const recallBotWss = new WebSocket.Server({ port: websocketPort });

// Track active meetings by recording ID
const activeMeetings = new Map<string, string>();

recallBotWss.on("listening", () => {
  console.log(`Recall Bot WebSocket server listening on port ${websocketPort}`);
  broadcastToUIClients(`Bot WebSocket ready on port ${websocketPort}`);
});

recallBotWss.on("connection", (ws) => {
  console.log("Recall Bot connected");
  broadcastToUIClients("Recall Bot connected - receiving data");

  ws.on("message", (message: WebSocket.Data) => {
    try {
      const wsMessage = JSON.parse(message.toString()) as RecallBotWebSocketMessage;

      // Handle transcript events
      if (wsMessage.event === "transcript.data" || wsMessage.event === "transcript.partial_data") {
        const transcriptEvent = wsMessage as TranscriptDataEvent;
        const data = transcriptEvent.data;

        // Get or create meeting from recording ID
        let meetingId: string | undefined;

        const recordingId: string | undefined = data.recording?.id;
        if (recordingId !== undefined) {
          const recId: string = recordingId;
          meetingId = activeMeetings.get(recId);

          if (!meetingId && data.bot?.id) {
            // Try to find meeting by bot ID
            const meeting = db.getMeetingByBotId(data.bot.id) as any;
            if (meeting && meeting.id) {
              const foundMeetingId: string = meeting.id;
              meetingId = foundMeetingId;
              activeMeetings.set(recId, foundMeetingId);
              db.updateMeeting(foundMeetingId, { recording_id: recId });
            }
          }
        }

        if (!meetingId) {
          console.log("No meeting found for transcript, creating new one");
          meetingId = db.createMeeting({
            meeting_url: "unknown",
            title: "Untitled Meeting",
          });
          const newRecordingId = data.recording?.id;
          if (newRecordingId) {
            activeMeetings.set(newRecordingId, meetingId);
            db.updateMeeting(meetingId, { recording_id: newRecordingId });
          }
        }

        // Process transcript
        if (data.data?.words && data.data.words.length > 0) {
          const text = data.data.words.map((w: any) => w.text).join(" ");
          const speakerName = data.data.participant?.name || "Speaker";
          const isFinal = wsMessage.event === "transcript.data";

          if (isFinal && text.trim()) {
            // Save transcript
            const transcriptId = db.addTranscript({
              meeting_id: meetingId,
              speaker_name: speakerName,
              text: text,
              is_final: true,
              timestamp_relative: data.data.words[0]?.start_timestamp,
              timestamp_absolute: data.data.timestamp?.absolute,
            });

            // Analyze for keywords
            const keywords = analyzeTranscriptLine(text, speakerName);
            for (const kw of keywords) {
              db.addKeyword({
                meeting_id: meetingId,
                keyword: kw.keyword,
                category: kw.category,
                context: kw.context,
                transcript_id: transcriptId,
              });
            }

            // Broadcast to UI
            broadcastToUIClients("Transcript received", {
              speaker: speakerName,
              text: text,
              words: data.data.words,
              timestamp: data.data.timestamp,
            });

            // Send keywords to UI
            const allKeywords = db.getKeywords(meetingId);
            sendToUIClients("keywords", allKeywords);
          }
        }
      } else {
        broadcastToUIClients(`Received: ${wsMessage.event}`, { event: wsMessage.event });
      }
    } catch (e: any) {
      console.error("Error processing message:", e.message);
      broadcastToUIClients("Error processing message", { error: e.message });
    }
  });

  ws.on("error", (error) => {
    console.error("Recall Bot WebSocket error:", error);
    broadcastToUIClients("Bot connection error", { error: error.message });
  });

  ws.on("close", () => {
    console.log("Recall Bot disconnected");
    broadcastToUIClients("Recall Bot disconnected - meeting may have ended");
  });
});

// Start the server
server.listen(expressPort, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    DO THIS FOR ME                          ║
║                  AI Meeting Notes                          ║
╠════════════════════════════════════════════════════════════╣
║  Web UI:     http://localhost:${expressPort.toString().padEnd(28)}║
║  Bot WS:     ws://localhost:${websocketPort.toString().padEnd(30)}║
║  OpenAI:     ${(isOpenAIConfigured() ? "Configured ✓" : "Not configured (offline mode)").padEnd(45)}║
╚════════════════════════════════════════════════════════════╝
  `);
  broadcastToUIClients("Server started");
});
