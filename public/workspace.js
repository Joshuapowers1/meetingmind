/* Meeting-focused workspace. All transcript/model output is rendered as text. */
let workspaceMeeting = null;
let assistanceRequest = 0;
let assistanceController = null;
let configuredAI = false;
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'The request could not be completed.');
  return data;
}
function showToast(message, error = false) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.toggle('error', error);
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}
function configureAssistance(status) {
  configuredAI = status.openai;
  updateAssistanceMode();
}
function updateAssistanceMode() {
  const local = document.getElementById('localAnswers').checked || !configuredAI;
  document.getElementById('assistMode').textContent = local ? 'Local excerpts' : 'AI ready';
  document.getElementById('assistPrivacy').textContent = local ? 'Assistant requests stay on this device.' : 'On request, recent context is sent to OpenAI.';
}
function renderWorkspaceMeeting(meeting) {
  if (workspaceMeeting?.id !== meeting.id) {
    assistanceRequest++;
    assistanceController?.abort();
    setAssistBusy(false);
    document.getElementById('assistResult').innerHTML = '<div class="assist-empty"><span>✦</span><h3>Your next thought, clearer.</h3><p>Choose a prompt or ask about this meeting. Answers use its recent transcript.</p></div>';
    document.getElementById('contextForm').reset();
    document.getElementById('assistForm').reset();
  }
  workspaceMeeting = meeting;
  const ended = meeting.status === 'completed';
  document.getElementById('contextCount').textContent = `${meeting.transcripts.length} segments`;
  document.getElementById('sessionStatus').textContent = meeting.platform === 'manual'
    ? (ended ? 'Session ended · saved on your device' : 'Manual session · add notes or paste a transcript')
    : 'Recall.ai notetaker · visible in the meeting';
  document.getElementById('endSession').hidden = Boolean(meeting.bot_id) || ended;
  document.getElementById('exportMeeting').href = '#';
  document.getElementById('contextForm').hidden = ended;
}
function renderSummary(summary) {
  const panel = document.getElementById('summaryPanel');
  panel.replaceChildren();
  const p = document.createElement('p'); p.textContent = summary.summary || 'No summary text available.'; panel.append(p);
  if (Array.isArray(summary.keyPoints) && summary.keyPoints.length) {
    const h = document.createElement('h4'); h.textContent = 'Key points'; panel.append(h);
    const ul = document.createElement('ul');
    summary.keyPoints.forEach(point => { const li = document.createElement('li'); li.textContent = point; ul.append(li); });
    panel.append(ul);
  }
}
function appendTranscript(segment) {
  const panel = document.getElementById('transcriptPanel');
  if ([...panel.querySelectorAll('[data-transcript-id]')].some(el => el.dataset.transcriptId === segment.id)) return;
  const follow = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 90;
  panel.querySelector('.empty-text')?.remove();
  const line = document.createElement('div'); line.className = 'transcript-line'; line.dataset.transcriptId = segment.id;
  const name = document.createElement('span'); name.className = 'transcript-speaker'; name.textContent = (segment.speaker || segment.speaker_name || 'Speaker') + ':';
  const text = document.createElement('span'); text.className = 'transcript-text'; text.textContent = segment.text;
  line.append(name, text); panel.append(line);
  document.getElementById('contextCount').textContent = `${panel.querySelectorAll('.transcript-line').length} segments`;
  if (follow) panel.scrollTop = panel.scrollHeight;
}
function setAssistBusy(busy) {
  document.querySelectorAll('[data-assist], #assistForm button').forEach(btn => { btn.disabled = busy; });
  document.getElementById('assistResult').setAttribute('aria-busy', String(busy));
}
async function requestAssistance(mode, question = '') {
  const meetingId = currentMeetingId;
  const request = ++assistanceRequest;
  assistanceController?.abort();
  assistanceController = new AbortController();
  const result = document.getElementById('assistResult');
  result.classList.remove('has-error');
  setAssistBusy(true);
  result.innerHTML = '<p class="assist-loading">Reading the conversation…</p>';
  try {
    const data = await api(`/api/meetings/${meetingId}/assist`, { method: 'POST', signal: assistanceController.signal, body: JSON.stringify({ mode, question, localOnly: document.getElementById('localAnswers').checked }) });
    if (request !== assistanceRequest || currentMeetingId !== meetingId) return;
    result.replaceChildren();
    const label = document.createElement('div'); label.className = 'answer-label'; label.textContent = data.mode === 'local' ? 'Local transcript excerpts' : mode === 'ask' ? question : ({ recap: 'The conversation so far', reply: 'A possible response', questions: 'Keep the conversation moving', actions: 'Turn discussion into action' })[mode];
    const answer = document.createElement('div'); answer.className = 'answer-text'; answer.textContent = data.answer;
    const notice = document.createElement('p'); notice.className = 'answer-notice'; notice.textContent = data.notice;
    result.append(label, answer, notice);
    if (data.sources?.length) {
      const details = document.createElement('details'); details.className = 'answer-sources';
      const summary = document.createElement('summary'); summary.textContent = `View context · ${data.sources.length} segments`; details.append(summary);
      data.sources.forEach((source, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'source-link'; button.textContent = `[${index + 1}] ${source.speaker_name || 'Speaker'}: ${source.text}`;
        button.addEventListener('click', () => {
          const line = [...document.querySelectorAll('[data-transcript-id]')].find(el => el.dataset.transcriptId === source.id);
          if (line) { line.scrollIntoView({ behavior: 'smooth', block: 'center' }); line.classList.add('source-highlight'); setTimeout(() => line.classList.remove('source-highlight'), 2000); }
        }); details.append(button);
      }); result.append(details);
    }
    const copy = document.createElement('button'); copy.className = 'btn btn-secondary copy-answer'; copy.textContent = 'Copy answer';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(data.answer); showToast('Answer copied.'); } catch { showToast('Copy is unavailable. Select the answer to copy it.', true); } }); result.append(copy);
  } catch (error) {
    if (error.name !== 'AbortError' && request === assistanceRequest && currentMeetingId === meetingId) { result.textContent = error.message; result.classList.add('has-error'); }
  } finally { if (request === assistanceRequest) setAssistBusy(false); }
}

document.addEventListener('DOMContentLoaded', () => {
  checkConnectionStatus();
  const toggleCover = () => { const cover = document.getElementById('privacyCover'); cover.hidden = !cover.hidden; document.querySelector('.app').inert = !cover.hidden; if (!cover.hidden) document.getElementById('restoreContent').focus(); else document.getElementById('hideContent').focus(); };
  document.getElementById('hideContent').onclick = toggleCover;
  document.getElementById('restoreContent').onclick = toggleCover;
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'h') { event.preventDefault(); toggleCover(); } });
  document.getElementById('startWorkspace').onclick = () => { openModal('sessionModal'); document.getElementById('sessionTitle').focus(); };
  document.querySelectorAll('[data-close-session]').forEach(el => el.onclick = () => closeModal('sessionModal'));
  document.getElementById('menuToggle').onclick = event => { const open = document.querySelector('.sidebar').classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', String(open)); };
  document.getElementById('focusMode').onclick = event => { const focused = document.body.classList.toggle('focus-mode'); event.currentTarget.setAttribute('aria-pressed', String(focused)); event.currentTarget.textContent = focused ? 'Exit focus' : 'Focus'; };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.querySelectorAll('.modal.active').forEach(el => closeModal(el.id)); document.body.classList.remove('focus-mode'); document.getElementById('focusMode').textContent = 'Focus'; document.getElementById('focusMode').setAttribute('aria-pressed', 'false'); } });
  document.getElementById('localAnswers').checked = localStorage.getItem('meetingmind.localAnswers') === 'true';
  document.getElementById('localAnswers').onchange = event => { localStorage.setItem('meetingmind.localAnswers', String(event.target.checked)); updateAssistanceMode(); };
  document.getElementById('sessionForm').onsubmit = async event => {
    event.preventDefault(); const btn = event.target.querySelector('[type=submit]'); btn.disabled = true;
    try { const meeting = await api('/api/meetings', { method: 'POST', body: JSON.stringify({ title: document.getElementById('sessionTitle').value }) }); closeModal('sessionModal'); await openMeeting(meeting.id); loadDashboardStats(); } catch (error) { showToast(error.message, true); } finally { btn.disabled = false; }
  };
  document.getElementById('contextForm').onsubmit = async event => {
    event.preventDefault(); const id = currentMeetingId; const btn = event.target.querySelector('[type=submit]'); btn.disabled = true;
    const input = document.getElementById('contextText'); const text = input.value;
    try { const segment = await api(`/api/meetings/${id}/transcripts`, { method: 'POST', body: JSON.stringify({ text, speaker: document.getElementById('contextSpeaker').value }) }); if (id === currentMeetingId) { appendTranscript(segment); if (input.value === text) input.value = ''; } } catch (error) { showToast(error.message, true); } finally { btn.disabled = false; }
  };
  document.querySelectorAll('[data-assist]').forEach(btn => btn.onclick = () => requestAssistance(btn.dataset.assist));
  document.getElementById('assistForm').onsubmit = event => { event.preventDefault(); requestAssistance('ask', document.getElementById('assistQuestion').value); };
  document.getElementById('exportMeeting').onclick = async event => {
    event.preventDefault();
    try {
      const response = await fetch(`/api/meetings/${currentMeetingId}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'md' }) });
      if (!response.ok) throw new Error('Could not export this meeting.');
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'meeting-notes.md'; document.body.append(link); link.click(); link.remove(); showToast('Meeting export prepared.'); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showToast(error.message, true); }
  };
  document.getElementById('endSession').onclick = async () => { const id = currentMeetingId; try { await api(`/api/meetings/${id}/end`, { method: 'POST' }); if (id === currentMeetingId) await openMeeting(id); showToast('Session ended and saved.'); } catch (error) { showToast(error.message, true); } };
  document.getElementById('deleteSession').onclick = async () => {
    const id = currentMeetingId;
    if (!confirm('Delete this meeting and its saved transcript and notes? This cannot be undone.')) return;
    try { await api(`/api/meetings/${id}`, { method: 'DELETE' }); if (id === currentMeetingId) { currentMeetingId = null; switchView('meetings'); } showToast('Meeting deleted.'); loadDashboardStats(); } catch (error) { showToast(error.message, true); }
  };
  document.getElementById('tryDemo').onclick = async event => {
    const btn = event.currentTarget; btn.disabled = true;
    try {
      const meeting = await api('/api/meetings', { method: 'POST', body: JSON.stringify({ title: 'Sample · Product launch check-in' }) });
      for (const [speaker, text] of [ ['Alex', 'The onboarding redesign is ready for review. We agreed to launch the pilot with ten customers next Monday.'], ['Morgan', 'I will send the updated onboarding checklist by Friday. We are still waiting on legal approval for the invite email.'], ['Sam', 'What will we use to measure whether the pilot worked? We should confirm the success criteria before sending invitations.'] ]) await api(`/api/meetings/${meeting.id}/transcripts`, { method: 'POST', body: JSON.stringify({ speaker, text }) });
      await openMeeting(meeting.id); showToast('Sample session created. Explore it or delete it when finished.');
    } catch (error) { showToast(error.message, true); } finally { btn.disabled = false; }
  };
});
