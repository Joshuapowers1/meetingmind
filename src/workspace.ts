import { Express } from "express";
import * as db from "./database";
import { analyzeTranscriptLine } from "./keywords";
import { assistMeeting, AssistMode, TranscriptSource } from "./assistant";
import { isOpenAIConfigured } from "./summarizer";

export function registerWorkspaceRoutes(app: Express, broadcast: (type: string, data: any) => void) {
  const busy = new Set<string>();
  app.get("/api/status", (_req, res) => {
    res.json({ openai: isOpenAIConfigured(), recall: Boolean(process.env.RECALL_API_KEY), storage: "local", assistant_model: process.env.ASSISTANT_MODEL || "gpt-4o-mini" });
  });

  app.post("/api/meetings", (req, res) => {
    const title = req.body?.title;
    if (typeof title !== "string" || !title.trim() || title.length > 160) {
      res.status(400).json({ error: "Enter a meeting title of 1–160 characters." }); return;
    }
    const id = db.createMeeting({ title: title.trim(), meeting_url: "", platform: "manual" });
    const meeting = db.getMeeting(id);
    broadcast("meeting_update", meeting);
    res.status(201).json(meeting);
  });

  app.post("/api/meetings/:id/transcripts", (req, res) => {
    const meeting = db.getMeeting(req.params.id) as any;
    if (!meeting) { res.status(404).json({ error: "Meeting not found." }); return; }
    if (meeting.status === "completed") { res.status(409).json({ error: "This session has ended. Start a new session to add text." }); return; }
    const { text, speaker } = req.body || {};
    if (typeof text !== "string" || !text.trim() || text.length > 20000 || (speaker !== undefined && (typeof speaker !== "string" || speaker.length > 80))) {
      res.status(400).json({ error: "Add 1–20,000 characters and a speaker name up to 80 characters." }); return;
    }
    const name = speaker?.trim() || "Notes";
    const id = db.addTranscript({ meeting_id: meeting.id, speaker_name: name, text: text.trim() });
    for (const kw of analyzeTranscriptLine(text, name)) {
      db.addKeyword({ meeting_id: meeting.id, transcript_id: id, keyword: kw.keyword, category: kw.category, context: kw.context });
    }
    const segment = { id, meeting_id: meeting.id, speaker: name, speaker_name: name, text: text.trim() };
    broadcast("transcript", segment);
    res.status(201).json(segment);
  });

  app.post("/api/meetings/:id/assist", async (req, res) => {
    const meeting = db.getMeeting(req.params.id);
    if (!meeting) { res.status(404).json({ error: "Meeting not found." }); return; }
    const { mode = "recap", question = "", localOnly = false } = req.body || {};
    if (!["recap", "reply", "questions", "actions", "ask"].includes(mode) || typeof question !== "string" || question.length > 2000 || typeof localOnly !== "boolean" || (mode === "ask" && !question.trim())) {
      res.status(400).json({ error: "Choose a valid assistance mode and a question up to 2,000 characters." }); return;
    }
    const transcripts = db.getTranscripts(req.params.id) as TranscriptSource[];
    if (!transcripts.length) { res.status(400).json({ error: "Add some meeting context first." }); return; }
    if (busy.has(req.params.id)) { res.status(429).json({ error: "An answer is already being prepared for this meeting." }); return; }
    busy.add(req.params.id);
    try {
      res.json(await assistMeeting(mode as AssistMode, transcripts, question.trim(), localOnly));
    } catch (error) {
      console.error("Meeting assistance failed", error instanceof Error ? error.message : "Unknown error");
      res.status(502).json({ error: "AI assistance is unavailable. Try again or enable local-only answers." });
    } finally { busy.delete(req.params.id); }
  });

  app.post("/api/meetings/:id/end", (req, res) => {
    const meeting = db.getMeeting(req.params.id) as any;
    if (!meeting) { res.status(404).json({ error: "Meeting not found." }); return; }
    if (meeting.bot_id) { res.status(409).json({ error: "Remove the visible notetaker from your meeting to stop capture. This control ends manual sessions only." }); return; }
    if (meeting.status !== "completed") {
      const start = new Date(meeting.started_at.replace(" ", "T") + (meeting.started_at.endsWith("Z") ? "" : "Z")).getTime();
      db.updateMeeting(meeting.id, { status: "completed", ended_at: new Date().toISOString(), duration_seconds: Math.max(0, Math.floor((Date.now() - start) / 1000)) });
    }
    const updated = db.getMeeting(meeting.id);
    broadcast("meeting_update", updated);
    res.json(updated);
  });
}
