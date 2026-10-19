const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectContext, offlineAssistance } = require('../dist/assistant');
const sources = [
  { id: 'a', speaker_name: 'Sam', text: 'We decided to launch the pilot on Monday.' },
  { id: 'b', speaker_name: 'Jo', text: 'I will send the checklist by Friday.' },
  { id: 'c', speaker_name: 'Lee', text: 'Who owns the customer invitations?' },
];
test('context stays bounded and preserves newest content and citation identities', () => {
  const result = selectContext(Array.from({ length: 200 }, (_, i) => ({ id: String(i), text: 'a'.repeat(500) })));
  assert.ok(result.reduce((n, s) => n + s.text.length, 0) <= 16000);
  assert.equal(result.at(-1).id, '199');
  assert.ok(result.length <= 80);
});
test('offline action excerpts cite real sources and disclose limitations', () => {
  const result = offlineAssistance('actions', sources);
  assert.equal(result.mode, 'local');
  assert.deepEqual(result.sources.map(s => s.id), ['b']);
  assert.match(result.answer, /checklist by Friday.*\[1\]/);
});
test('offline query misses do not fabricate an answer', () => {
  const result = offlineAssistance('ask', sources, 'What is the budget?');
  assert.equal(result.sources.length, 0);
  assert.match(result.answer, /No matching statements/);
});

const summarizer = require('../dist/summarizer');
const { assistMeeting } = require('../dist/assistant');
test('AI assistance sends bounded selected-meeting context and returns inspectable citations', async () => {
  const originalConfigured = summarizer.isOpenAIConfigured;
  const originalClient = summarizer.getOpenAI;
  let called = false;
  summarizer.isOpenAIConfigured = () => true;
  summarizer.getOpenAI = () => ({ chat: { completions: { create: async (request, options) => {
    called = true;
    assert.match(request.messages[0].content, /untrusted reference/);
    assert.match(request.messages[1].content, /\[2\] Jo: I will send/);
    assert.equal(options.timeout, 30000);
    return { choices: [{ message: { content: 'Jo will send the checklist by Friday. [2]' } }] };
  } } } });
  try {
    const result = await assistMeeting('actions', sources);
    assert.equal(called, true); assert.equal(result.mode, 'ai'); assert.equal(result.sources[1].id, 'b');
    called = false;
    assert.equal((await assistMeeting('actions', sources, '', true)).mode, 'local');
    assert.equal(called, false, 'local-only must never call the AI provider');
  } finally { summarizer.isOpenAIConfigured = originalConfigured; summarizer.getOpenAI = originalClient; }
});
