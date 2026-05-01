# Do This For Me

AI-powered meeting note taker inspired by **Fathom AI** and **Granola**. Features real-time transcription, intelligent keyword detection, AI summaries, and advanced features like cross-meeting search, coaching scorecards, and auto-join.

## Features

### Core Features
- **Bot joins your meetings** — Works with Google Meet, Zoom, Teams
- **Real-time transcription** — See what's being said as it happens
- **Keyword detection** — Automatically identifies action items, decisions, deadlines, blockers
- **AI summaries** — Generate meeting summaries with key points and action items
- **Local storage** — All data stored locally in SQLite
- **Search** — Find past meetings by content, keywords, or title

### Fathom-Inspired Features
- **Meeting Highlights/Clips** — Save and share key moments from meetings
- **Ask DTFM** — AI chat across all your meetings (like Fathom's "Ask Fathom")
- **Coaching Scorecards** — Meeting effectiveness scores with AI feedback
- **Calendar Auto-Join** — Automatically send bot to scheduled meetings

### Granola-Inspired Features
- **Enhanced Notes** — Transform rough notes into polished documents
- **Meeting Templates** — Pre-built structures for 1:1s, standups, sales calls
- **Cross-meeting Intelligence** — Search and reference past meetings

### Additional Features
- **Follow-up Emails** — AI-generated follow-up emails from meetings
- **Speaker Analytics** — Track talk time and participation
- **CRM Integration** — Link meetings to contacts and companies
- **Team Collaboration** — Comments, sharing, and folders

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your RECALL_API_KEY (required)
# Optionally add OPENAI_API_KEY for AI summaries

# 3. Start ngrok (in a separate terminal)
ngrok http 3456

# 4. Start the server
npm run dev

# 5. Open http://localhost:3000
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RECALL_API_KEY` | Yes | Get from [Recall.ai Dashboard](https://us-west-2.recall.ai/dashboard/developers/api-keys) |
| `OPENAI_API_KEY` | No | For AI-powered features. Without this, basic functionality still works |
| `PORT` | No | Web server port (default: 3000) |
| `WEBSOCKET_PORT` | No | WebSocket port for Recall.ai bot (default: 3456) |

## How It Works

1. **Click "New Meeting"** — Enter your meeting URL and ngrok WebSocket URL
2. **Bot joins the meeting** — Recall.ai bot joins and starts transcribing
3. **Keywords detected live** — Action items, decisions, deadlines appear as people talk
4. **Generate summary** — Click the star button to create an AI summary after the meeting
5. **Ask questions** — Use "Ask DTFM" to search across all your meetings
6. **Get coaching** — View meeting scores and feedback to improve

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: SQLite (better-sqlite3)
- **Real-time**: WebSocket
- **Transcription**: Recall.ai
- **AI**: OpenAI GPT-4o (optional)

## API Endpoints

### Core Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings` | GET | List all meetings |
| `/api/meetings/:id` | GET | Get meeting with transcripts, keywords, notes |
| `/api/meetings/:id/summarize` | POST | Generate AI summary |
| `/api/search?q=query` | GET | Search meetings |
| `/send-bot` | POST | Send bot to a meeting |

### Fathom/Granola Feature Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings/:id/highlights` | GET/POST | Meeting clips/highlights |
| `/api/templates` | GET/POST | Meeting templates |
| `/api/settings` | GET/PUT | User settings (auto-join, etc.) |
| `/api/ai/conversations` | GET/POST | Ask DTFM conversations |
| `/api/ai/conversations/:id/messages` | GET/POST | Chat messages |
| `/api/meetings/:id/enhanced-notes` | GET/POST | Enhanced notes |
| `/api/meetings/:id/followup-emails` | GET/POST | Follow-up emails |
| `/api/meetings/:id/scores` | GET/POST | Coaching scorecards |
| `/api/analytics/speakers` | GET | Speaker statistics |
| `/api/auto-join/start` | POST | Enable auto-join |
| `/api/auto-join/stop` | POST | Disable auto-join |

## Project Structure

```
do-this-for-me/
├── src/
│   ├── index.ts       # Main server with all API routes
│   ├── database.ts    # SQLite operations (20+ tables)
│   ├── keywords.ts    # Keyword detection
│   ├── summarizer.ts  # AI summarization
│   └── types.ts       # TypeScript types
├── public/
│   ├── index.html     # Web UI
│   ├── style.css      # Styling
│   └── app.js         # Frontend JS
├── data/              # SQLite database (auto-created)
└── dist/              # Compiled JS (auto-generated)
```

## Database Schema

The database includes tables for:

**Core**: meetings, participants, transcripts, keywords, notes, action_items

**CRM**: companies, contacts, contact_meetings, relationships

**Collaboration**: teams, comments, shares, folders, tags

**Fathom/Granola Features**: highlights, meeting_templates, user_settings, ai_conversations, ai_messages, enhanced_notes, followup_emails, meeting_scores

**Integration**: webhooks, calendar_events, exports

## Contributing

We welcome contributions! Here are some areas where help is needed:

### High Priority
- [ ] Google Calendar OAuth integration for auto-join
- [ ] Outlook/Microsoft 365 calendar integration
- [ ] Video clip extraction from recordings
- [ ] Team sharing and permissions
- [ ] Mobile responsive UI

### Medium Priority
- [ ] Slack/Teams notifications
- [ ] Chrome extension for calendar detection
- [ ] Custom keyword categories
- [ ] Meeting recording playback
- [ ] Export to Notion/Confluence

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Read the code comments in `src/index.ts` and `src/database.ts`
4. Make your changes
5. Test locally with `npm run dev`
6. Submit a pull request

### Code Style
- TypeScript with strict mode
- Comprehensive JSDoc comments on functions
- Feature sections clearly labeled in code

## Keyword Categories

The system automatically detects:

| Category | Examples |
|----------|----------|
| Action Items | "need to", "will do", "should", "action item" |
| Decisions | "decided", "agreed", "approved", "confirmed" |
| Deadlines | "by Friday", "end of week", "ASAP" |
| Follow-ups | "follow up", "circle back", "schedule a call" |
| Blockers | "blocked", "stuck", "waiting on" |
| Questions | Sentences with question words or "?" |
| Numbers | "$10,000", "50%", "Q3", "2 million" |

## Cost

- **Recall.ai**: $0.50/hour of recorded meeting (5 free hours to start)
- **OpenAI**: ~$0.01-0.10 per AI feature call (optional)

## License

MIT

## Acknowledgments

- Inspired by [Fathom AI](https://fathom.video) and [Granola](https://granola.so)
- Built with [Recall.ai](https://recall.ai) for meeting bot functionality
- Powered by [OpenAI](https://openai.com) for AI features
