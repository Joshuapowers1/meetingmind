const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const net = require('node:net');
let server, base, wsPort, folder, logs = '';
async function freePort() { return new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); }); }
async function request(url, method = 'GET', body) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  const port = await freePort(); wsPort = await freePort(); base = `http://127.0.0.1:${port}`;
  folder = mkdtempSync(path.join(tmpdir(), 'meetingmind-test-'));
  server = spawn(process.execPath, ['dist/index.js'], { env: { ...process.env, PORT: String(port), WEBSOCKET_PORT: String(wsPort), DATABASE_PATH: path.join(folder, 'new', 'meetings.db'), OPENAI_API_KEY: '', RECALL_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
  for (let i = 0; i < 100; i++) { try { await fetch(base + '/api/status'); return; } catch {} await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(logs);
});
after(async () => { if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)); } rmSync(folder, { recursive: true, force: true }); });
test('fresh startup, truthful configuration, and validated local meeting creation', async () => {
  const status = await request('/api/status'); assert.equal(status.data.openai, false); assert.equal(status.data.recall, false);
  assert.equal((await request('/api/meetings', 'POST', { title: '' })).status, 400);
  assert.equal((await request('/api/meetings', 'POST', { title: 'a'.repeat(161) })).status, 400);
  assert.equal((await request('/api/meetings/missing/assist', 'POST', { mode: 'recap' })).status, 404);
});
test('manual session, scoped transcript broadcast, assistance, export and end lifecycle', async () => {
  const meeting = (await request('/api/meetings', 'POST', { title: 'Pilot review' })).data;
  const other = (await request('/api/meetings', 'POST', { title: 'Unrelated confidential meeting' })).data;
  const ui = new WebSocket(base.replace('http', 'ws') + '/ui-updates');
  await new Promise(resolve => ui.once('open', resolve));
  const event = new Promise(resolve => ui.on('message', raw => { const m = JSON.parse(raw); if (m.type === 'transcript') resolve(m); }));
  try {
    assert.equal((await request(`/api/meetings/${meeting.id}/assist`, 'POST', { mode: 'recap' })).status, 400);
    const added = await request(`/api/meetings/${meeting.id}/transcripts`, 'POST', { speaker: 'Alex', text: 'I will send the launch checklist by Friday.' });
    assert.equal(added.status, 201);
    const update = await event; assert.equal(update.data.meeting_id, meeting.id); assert.equal(update.data.id, added.data.id);
    await request(`/api/meetings/${other.id}/transcripts`, 'POST', { text: 'Secret acquisition codename.' });
    const answer = await request(`/api/meetings/${meeting.id}/assist`, 'POST', { mode: 'actions', localOnly: true });
    assert.equal(answer.data.mode, 'local'); assert.match(answer.data.answer, /checklist/); assert.doesNotMatch(JSON.stringify(answer.data), /acquisition/);
    assert.equal((await request(`/api/meetings/${meeting.id}/assist`, 'POST', { mode: 'ask', question: '' })).status, 400);
    const exported = await fetch(base + `/api/meetings/${meeting.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'md' }) });
    assert.equal(exported.status, 200); assert.match(await exported.text(), /checklist/);
    await request(`/api/meetings/${meeting.id}/summarize`, 'POST');
    const firstSummary = (await request(`/api/meetings/${meeting.id}`)).data;
    await request(`/api/meetings/${meeting.id}/summarize`, 'POST');
    const repeatedSummary = (await request(`/api/meetings/${meeting.id}`)).data;
    assert.equal(repeatedSummary.actionItems.length, firstSummary.actionItems.length);
    assert.ok(JSON.parse(repeatedSummary.summary.content).summary);
    assert.equal((await request(`/api/meetings/${meeting.id}/end`, 'POST')).data.status, 'completed');
    assert.equal((await request(`/api/meetings/${meeting.id}/transcripts`, 'POST', { text: 'Too late.' })).status, 409);
    assert.equal((await request(`/api/meetings/${meeting.id}`, 'DELETE')).status, 200);
    assert.equal((await request(`/api/meetings/${meeting.id}`)).status, 404);
  } finally { ui.close(); }
});
test('Recall final transcript handles object timestamps and uses the UI event contract', async () => {
  const meeting = (await request('/api/meetings', 'POST', { title: 'Recall test' })).data;
  await request(`/api/meetings/${meeting.id}`, 'PATCH', { bot_id: 'test-bot' });
  const recall = new WebSocket(`ws://127.0.0.1:${wsPort}`);
  await new Promise(resolve => recall.once('open', resolve));
  recall.send(JSON.stringify({ event: 'transcript.data', data: { bot: { id: 'test-bot' }, recording: { id: 'test-recording' }, data: { participant: { name: 'Speaker' }, words: [{ text: 'Hello', start_timestamp: { relative: 12.5 } }] } } }));
  try {
    let saved;
    for (let i = 0; i < 30; i++) { saved = (await request(`/api/meetings/${meeting.id}`)).data; if (saved.transcripts.length) break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(saved.transcripts.length, 1); assert.equal(saved.transcripts[0].timestamp_relative, 12.5);
    assert.equal((await request(`/api/meetings/${meeting.id}/end`, 'POST')).status, 409);
  } finally { recall.close(); }
});
