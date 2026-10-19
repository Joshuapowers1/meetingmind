/**
 * MeetingMind - AI Meeting Intelligence
 * Frontend Application
 */

// ============================================================================
// STATE
// ============================================================================
let currentView = 'dashboard';
let currentMeetingId = null;
let meetings = [];
let contacts = [];
let actionItems = [];
let aiConversationId = null;

// ============================================================================
// DOM READY
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initModals();
  initDashboard();
  initMeetings();
  initAskAI();
  initSettings();
  initContacts();
  connectWebSocket();
  loadInitialData();
});

// ============================================================================
// NAVIGATION
// ============================================================================
function initNavigation() {
  // Main nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // Dashboard quick actions
  const quickNewMeeting = document.getElementById('quickNewMeeting');
  const quickAskAI = document.getElementById('quickAskAI');
  const quickActions = document.getElementById('quickActions');
  const quickSettings = document.getElementById('quickSettings');

  if (quickNewMeeting) quickNewMeeting.addEventListener('click', () => openModal('newMeetingModal'));
  if (quickAskAI) quickAskAI.addEventListener('click', () => switchView('askAI'));
  if (quickActions) quickActions.addEventListener('click', () => switchView('actionItems'));
  if (quickSettings) quickSettings.addEventListener('click', () => switchView('settings'));

  // View all buttons
  const viewAllMeetings = document.getElementById('viewAllMeetings');
  const viewAllActions = document.getElementById('viewAllActions');

  if (viewAllMeetings) viewAllMeetings.addEventListener('click', () => switchView('meetings'));
  if (viewAllActions) viewAllActions.addEventListener('click', () => switchView('actionItems'));

  // Back button
  const backBtn = document.getElementById('backToMeetings');
  if (backBtn) backBtn.addEventListener('click', () => switchView('meetings'));
}

function switchView(viewName) {
  currentView = viewName;
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("menuToggle")?.setAttribute("aria-expanded", "false");

  // Update nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  const viewId = viewName + 'View';
  const viewEl = document.getElementById(viewId);
  if (viewEl) {
    viewEl.classList.add('active');
  }

  // Load view-specific data
  if (viewName === 'meetings') loadMeetings();
  if (viewName === 'actionItems') loadActionItems();
  if (viewName === 'contacts') loadContacts();
  if (viewName === 'settings') loadSettings();
}

// ============================================================================
// MODALS
// ============================================================================
function initModals() {
  // New Meeting Modal
  const newMeetingBtns = [
    document.getElementById('newMeetingBtn'),
    document.getElementById('newMeetingBtn2')
  ];
  newMeetingBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', () => openModal('newMeetingModal'));
  });

  const closeModalBtn = document.getElementById('closeModal');
  const cancelNewMeeting = document.getElementById('cancelNewMeeting');
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => closeModal('newMeetingModal'));
  if (cancelNewMeeting) cancelNewMeeting.addEventListener('click', () => closeModal('newMeetingModal'));

  // Contact Modal
  const addContactBtn = document.getElementById('addContactBtn');
  const closeContactModal = document.getElementById('closeContactModal');
  const cancelContact = document.getElementById('cancelContact');

  if (addContactBtn) addContactBtn.addEventListener('click', () => openModal('contactModal'));
  if (closeContactModal) closeContactModal.addEventListener('click', () => closeModal('contactModal'));
  if (cancelContact) cancelContact.addEventListener('click', () => closeModal('contactModal'));

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Form submissions
  const newMeetingForm = document.getElementById('newMeetingForm');
  if (newMeetingForm) {
    newMeetingForm.addEventListener('submit', handleNewMeeting);
  }

  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', handleNewContact);
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    const form = modal.querySelector('form');
    if (form) form.reset();
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================
function initDashboard() {
  loadDashboardStats();
}

async function loadDashboardStats() {
  try {
    // Load stats from analytics endpoint
    const response = await fetch('/api/analytics');
    if (response.ok) {
      const data = await response.json();
      document.getElementById('totalMeetings').textContent = data.total_meetings || 0;
      document.getElementById('completedActions').textContent = data.completed_actions || 0;
      document.getElementById('totalHours').textContent = (data.total_hours || 0) + 'h';
      document.getElementById('avgScore').textContent = data.avg_score || '--';
    }
  } catch (e) {
    console.log('Analytics not available');
  }

  // Load recent meetings
  loadRecentMeetings();
  loadPendingActions();
}

async function loadRecentMeetings() {
  try {
    const response = await fetch('/api/meetings?limit=5');
    if (response.ok) {
      const data = await response.json();
      const container = document.getElementById('recentMeetingsList');

      if (data.length === 0) {
        container.innerHTML = `
          <div class="empty-state-inline">
            <p>No meetings yet. Start your first meeting to see it here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = data.map(meeting => `
        <div class="meeting-row" data-id="${meeting.id}">
          <div class="meeting-row-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            </svg>
          </div>
          <div class="meeting-row-info">
            <span class="meeting-row-title">${escapeHtml(meeting.title || 'Untitled Meeting')}</span>
            <span class="meeting-row-date">${formatDate(meeting.created_at)}</span>
          </div>
          <span class="meeting-row-status ${meeting.status === 'active' ? 'active' : ''}">${meeting.status || 'ended'}</span>
        </div>
      `).join('');

      // Add click handlers
      container.querySelectorAll('.meeting-row').forEach(row => {
        row.addEventListener('click', () => {
          openMeeting(row.dataset.id);
        });
      });
    }
  } catch (e) {
    console.log('Could not load recent meetings');
  }
}

async function loadPendingActions() {
  try {
    const response = await fetch('/api/action-items?status=pending&limit=5');
    if (response.ok) {
      const data = await response.json();
      const container = document.getElementById('pendingActionsList');

      if (data.length === 0) {
        container.innerHTML = `
          <div class="empty-state-inline">
            <p>No pending action items. Action items from your meetings will appear here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = data.map(item => `
        <div class="action-row">
          <div class="action-checkbox" data-id="${item.id}"></div>
          <div class="action-row-content">
            <span class="action-row-text">${escapeHtml(item.description)}</span>
            ${item.assignee ? `<span class="action-row-assignee">@${escapeHtml(item.assignee)}</span>` : ''}
          </div>
        </div>
      `).join('');

      // Add checkbox handlers
      container.querySelectorAll('.action-checkbox').forEach(cb => {
        cb.addEventListener('click', async () => {
          const id = cb.dataset.id;
          await toggleActionItem(id);
          loadPendingActions();
        });
      });
    }
  } catch (e) {
    console.log('Could not load pending actions');
  }
}

// ============================================================================
// MEETINGS
// ============================================================================
function initMeetings() {
  const searchInput = document.getElementById('searchMeetings');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterMeetings(e.target.value);
    });
  }
}

async function loadMeetings() {
  try {
    const response = await fetch('/api/meetings');
    if (response.ok) {
      meetings = await response.json();
      renderMeetings();
    }
  } catch (e) {
    console.log('Could not load meetings');
  }
}

function renderMeetings(filtered = null) {
  const container = document.getElementById('meetingsGrid');
  const data = filtered || meetings;

  if (data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        </svg>
        <h3>No meetings yet</h3>
        <p>Click "New Meeting" to start capturing your first meeting.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map(meeting => `
    <div class="meeting-card" data-id="${meeting.id}">
      <div class="meeting-card-header">
        <h3>${escapeHtml(meeting.title || 'Untitled Meeting')}</h3>
        <span class="meeting-card-status ${meeting.status === 'active' ? 'active' : ''}">${meeting.status || 'ended'}</span>
      </div>
      <div class="meeting-card-date">${formatDate(meeting.created_at)}</div>
      <div class="meeting-card-platform">${meeting.platform || 'Unknown'}</div>
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.meeting-card').forEach(card => {
    card.addEventListener('click', () => {
      openMeeting(card.dataset.id);
    });
  });
}

function filterMeetings(query) {
  if (!query) {
    renderMeetings();
    return;
  }

  const filtered = meetings.filter(m =>
    (m.title || '').toLowerCase().includes(query.toLowerCase())
  );
  renderMeetings(filtered);
}

async function openMeeting(meetingId) {
  currentMeetingId = meetingId;
  switchView('meetingDetail');
  document.getElementById('meetingTitle').textContent = 'Loading meeting…';
  document.getElementById('contextForm').hidden = true;
  document.getElementById('endSession').hidden = true;
  if (workspaceMeeting?.id !== meetingId) {
    assistanceController?.abort();
    assistanceRequest++;
    setAssistBusy(true);
    document.getElementById('assistResult').textContent = 'Loading meeting context…';
  }
  for (const id of ['transcriptPanel', 'summaryPanel', 'actionItemsPanel']) document.getElementById(id).replaceChildren();

  try {
    const response = await fetch(`/api/meetings/${meetingId}`);
    if (!response.ok) throw new Error("Meeting unavailable");
    if (response.ok) {
      const data = await response.json();
      if (currentMeetingId !== meetingId || currentView !== 'meetingDetail') return;
      renderWorkspaceMeeting(data);

      document.getElementById('meetingTitle').textContent = data.title || 'Untitled Meeting';
      document.getElementById('meetingDate').textContent = formatDate(data.created_at);

      // Render transcript
      const transcriptPanel = document.getElementById('transcriptPanel');
      if (data.transcripts && data.transcripts.length > 0) {
        transcriptPanel.innerHTML = data.transcripts.map(t => `
          <div class="transcript-line" data-transcript-id="${escapeHtml(t.id)}">
            <span class="transcript-speaker">${escapeHtml(t.speaker_name || 'Speaker')}:</span>
            <span class="transcript-text">${escapeHtml(t.text)}</span>
          </div>
        `).join('');
      } else {
        transcriptPanel.innerHTML = '<p class="empty-text">No transcript yet.</p>';
      }

      // Render action items
      const actionPanel = document.getElementById('actionItemsPanel');
      if (data.actionItems && data.actionItems.length > 0) {
        actionPanel.innerHTML = data.actionItems.map(item => `
          <div class="action-item">
            <span>${escapeHtml(item.description)}</span>
            ${item.assignee ? `<span class="assignee">@${escapeHtml(item.assignee)}</span>` : ''}
          </div>
        `).join('');
      } else {
        actionPanel.innerHTML = '<p class="empty-text">No action items yet.</p>';
      }

      // Render summary
      const summaryPanel = document.getElementById('summaryPanel');
      if (data.summary) {
        let summary;
        try { summary = JSON.parse(data.summary.content); } catch { summary = { summary: data.summary.content }; }
        renderSummary(summary);
      } else {
        summaryPanel.innerHTML = '<p class="empty-text">Click the star button to generate an AI summary.</p>';
      }
    }
  } catch (e) {
    if (currentMeetingId === meetingId) {
      document.getElementById('meetingTitle').textContent = 'Meeting unavailable';
      document.getElementById('assistResult').textContent = 'Return to Meetings and try again.';
      showToast('Could not load this meeting. Try again.', true);
    }
    return;
  }

  // Set up action buttons
  const generateSummary = document.getElementById('generateSummary');
  if (generateSummary) {
    generateSummary.onclick = () => generateMeetingSummary(meetingId);
  }

  const generateEmail = document.getElementById('generateEmail');
  if (generateEmail) {
    generateEmail.onclick = () => generateFollowupEmail(meetingId);
  }

  const getMeetingScore = document.getElementById('getMeetingScore');
  if (getMeetingScore) {
    getMeetingScore.onclick = () => getMeetingScoreAction(meetingId);
  }
}

async function handleNewMeeting(e) {
  e.preventDefault();

  const meetingUrl = document.getElementById('meetingUrl').value;
  const botName = document.getElementById('botName').value || 'MeetingMind Notetaker';
  const websocketUrl = document.getElementById('websocketUrl').value;

  try {
    const response = await fetch('/send-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: botName,
        recording_config: {
          transcript: { provider: { meeting_captions: {} } },
          realtime_endpoints: [{
            type: 'websocket',
            url: websocketUrl,
            events: ['transcript.data', 'transcript.partial_data']
          }]
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      closeModal('newMeetingModal');
      updateStatus('Recording', 'recording');

      // Reload meetings
      await loadMeetings();
      await loadRecentMeetings();

      // Open the new meeting
      if (data.meeting_id) {
        openMeeting(data.meeting_id);
      }
    } else {
      const error = await response.json();
      alert('Error: ' + (error.error || error.message || 'Failed to send bot'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error sending bot to meeting');
  }
}

async function generateMeetingSummary(meetingId) {
  const btn = document.getElementById('generateSummary');
  btn.disabled = true;

  try {
    const response = await fetch(`/api/meetings/${meetingId}/summarize`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      if (currentMeetingId !== meetingId) return;
      const summaryPanel = document.getElementById('summaryPanel');

      let html = '';
      if (data.summary?.summary) {
        html += `<p>${escapeHtml(data.summary.summary)}</p>`;
      }
      if (data.summary?.keyPoints?.length) {
        html += '<h4>Key Points</h4><ul>';
        html += data.summary.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('');
        html += '</ul>';
      }

      summaryPanel.innerHTML = html || '<p>Summary generated.</p>';
    } else {
      const error = await response.json();
      showToast(error.error || 'Could not generate a summary.', true);
    }
  } catch (e) {
    alert('Failed to generate summary');
  } finally {
    btn.disabled = false;
  }
}

async function generateFollowupEmail(meetingId) {
  try {
    const response = await fetch(`/api/meetings/${meetingId}/followup-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone: 'professional' })
    });

    if (response.ok) {
      const data = await response.json();
      alert(`Follow-up email generated!\n\nSubject: ${data.subject}\n\n${data.body}`);
    }
  } catch (e) {
    alert('Failed to generate email');
  }
}

async function getMeetingScoreAction(meetingId) {
  try {
    const response = await fetch(`/api/meetings/${meetingId}/scores`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      alert(`Meeting Score: ${data.scores?.overall || '--'}/100\n\n${data.feedback || 'No feedback available.'}`);
    }
  } catch (e) {
    alert('Failed to get meeting score');
  }
}

// ============================================================================
// ASK MEETINGMIND (AI CHAT)
// ============================================================================
function initAskAI() {
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendChatBtn');

  if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // Example queries
  document.querySelectorAll('.example-query').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.textContent.replace(/"/g, '');
      document.getElementById('chatInput').value = query;
      sendChatMessage();
    });
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const chatMessages = document.getElementById('chatMessages');

  // Remove welcome message if present
  const welcome = chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Add user message
  chatMessages.innerHTML += `
    <div class="chat-message user">
      <div class="chat-message-content">${escapeHtml(message)}</div>
    </div>
  `;

  input.value = '';
  input.disabled = true;

  // Create conversation if needed
  if (!aiConversationId) {
    try {
      const response = await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: message.slice(0, 50) })
      });
      if (response.ok) {
        const data = await response.json();
        aiConversationId = data.id;
      }
    } catch (e) {
      console.log('Could not create conversation');
    }
  }

  // Send message
  try {
    const response = await fetch(`/api/ai/conversations/${aiConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });

    if (response.ok) {
      const data = await response.json();
      chatMessages.innerHTML += `
        <div class="chat-message assistant">
          <div class="chat-message-content">${escapeHtml(data.content || 'I could not find an answer.')}</div>
        </div>
      `;
    }
  } catch (e) {
    chatMessages.innerHTML += `
      <div class="chat-message assistant">
        <div class="chat-message-content">Sorry, I encountered an error. Please try again.</div>
      </div>
    `;
  }

  input.disabled = false;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================================================
// ACTION ITEMS
// ============================================================================
async function loadActionItems(filter = 'pending') {
  try {
    const response = await fetch(`/api/action-items?status=${filter}`);
    if (response.ok) {
      actionItems = await response.json();
      renderActionItems();
    }
  } catch (e) {
    console.log('Could not load action items');
  }
}

function renderActionItems() {
  const container = document.getElementById('allActionItemsList');

  if (actionItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h3>No action items yet</h3>
        <p>Action items from your meetings will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = actionItems.map(item => `
    <div class="action-item-row ${item.status === 'completed' ? 'completed' : ''}">
      <div class="action-checkbox ${item.status === 'completed' ? 'checked' : ''}" data-id="${item.id}"></div>
      <div class="action-item-content">
        <span class="action-item-text">${escapeHtml(item.description)}</span>
        <div class="action-item-meta">
          ${item.assignee ? `<span class="assignee">@${escapeHtml(item.assignee)}</span>` : ''}
          ${item.due_date ? `<span class="due-date">Due: ${item.due_date}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');

  // Add handlers
  container.querySelectorAll('.action-checkbox').forEach(cb => {
    cb.addEventListener('click', async () => {
      await toggleActionItem(cb.dataset.id);
    });
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadActionItems(tab.dataset.filter);
    });
  });
}

async function toggleActionItem(id) {
  try {
    const item = actionItems.find(i => i.id === id);
    const newStatus = item?.status === 'completed' ? 'pending' : 'completed';

    await fetch(`/api/action-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    loadActionItems();
  } catch (e) {
    console.log('Could not update action item');
  }
}

// ============================================================================
// CONTACTS
// ============================================================================
function initContacts() {
  // Contact form handled in initModals
}

async function loadContacts() {
  try {
    const response = await fetch('/api/contacts');
    if (response.ok) {
      contacts = await response.json();
      renderContacts();
    }
  } catch (e) {
    console.log('Could not load contacts');
  }
}

function renderContacts() {
  const container = document.getElementById('contactsGrid');

  if (contacts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <h3>No contacts yet</h3>
        <p>Add contacts to link them to your meetings.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = contacts.map(contact => `
    <div class="contact-card">
      <div class="contact-avatar">${(contact.first_name || 'U')[0].toUpperCase()}</div>
      <div class="contact-info">
        <h3>${escapeHtml(contact.first_name || '')} ${escapeHtml(contact.last_name || '')}</h3>
        ${contact.title ? `<p class="contact-title">${escapeHtml(contact.title)}</p>` : ''}
        ${contact.email ? `<p class="contact-email">${escapeHtml(contact.email)}</p>` : ''}
      </div>
    </div>
  `).join('');
}

async function handleNewContact(e) {
  e.preventDefault();

  const firstName = document.getElementById('contactFirstName').value;
  const lastName = document.getElementById('contactLastName').value;
  const email = document.getElementById('contactEmail').value;
  const title = document.getElementById('contactTitle').value;

  try {
    const response = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email,
        title
      })
    });

    if (response.ok) {
      closeModal('contactModal');
      loadContacts();
    }
  } catch (e) {
    alert('Failed to create contact');
  }
}

// ============================================================================
// SETTINGS
// ============================================================================
function initSettings() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      const data = await response.json();

      document.getElementById('autoJoinToggle').checked = data.auto_join_enabled === 1;
      document.getElementById('joinMinutesBefore').value = data.auto_join_minutes_before || 1;
      document.getElementById('defaultBotName').value = data.default_bot_name || '';
      document.getElementById('autoSummarizeToggle').checked = data.auto_summarize === 1;
      document.getElementById('autoActionItemsToggle').checked = data.auto_detect_action_items === 1;
    }

    // Check connection status
    checkConnectionStatus();
  } catch (e) {
    console.log('Could not load settings');
  }
}

async function saveSettings() {
  try {
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_join_enabled: document.getElementById('autoJoinToggle').checked ? 1 : 0,
        auto_join_minutes_before: parseInt(document.getElementById('joinMinutesBefore').value),
        default_bot_name: document.getElementById('defaultBotName').value,
        auto_summarize: document.getElementById('autoSummarizeToggle').checked ? 1 : 0,
        auto_detect_action_items: document.getElementById('autoActionItemsToggle').checked ? 1 : 0
      })
    });

    if (response.ok) {
      alert('Settings saved!');
    }
  } catch (e) {
    alert('Failed to save settings');
  }
}

async function checkConnectionStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Status unavailable');
    const data = await response.json();
    for (const key of ['openai', 'recall']) {
      const el = document.getElementById(key + 'Status');
      el.textContent = data[key] ? 'Configured' : 'Not configured';
      el.className = 'status-badge ' + (data[key] ? 'success' : 'warning');
    }
    configureAssistance(data);
  } catch {
    for (const key of ['openai', 'recall']) document.getElementById(key + 'Status').textContent = 'Unavailable';
  }
}

// ============================================================================
// WEBSOCKET
// ============================================================================
let ws = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ui-updates`);

  ws.onopen = () => {
    updateStatus('Connected', 'success');
    if (currentView === 'meetingDetail' && currentMeetingId) openMeeting(currentMeetingId);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    } catch (e) {
      console.log('Message parse error');
    }
  };

  ws.onclose = () => {
    updateStatus('Disconnected', 'error');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {
    updateStatus('Error', 'error');
  };
}

function handleServerMessage(message) {
  if (message.type === 'transcript' && currentView === 'meetingDetail' && message.data?.meeting_id === currentMeetingId) {
    appendTranscript(message.data);
  }

  // Refresh data on meeting updates
  if (message.type === 'meeting_update') {
    if (currentView === 'meetingDetail' && message.data?.id === currentMeetingId) openMeeting(currentMeetingId);
    if (currentView === 'dashboard') {
      loadRecentMeetings();
      loadPendingActions();
    } else if (currentView === 'meetings') {
      loadMeetings();
    }
  }
}

function updateStatus(text, type = 'success') {
  const indicator = document.getElementById('statusIndicator');
  const dot = indicator.querySelector('.status-dot');
  const textEl = indicator.querySelector('.status-text');

  textEl.textContent = text;
  dot.className = 'status-dot';

  if (type === 'recording') dot.classList.add('recording');
  if (type === 'error') dot.classList.add('error');
}

// ============================================================================
// UTILITIES
// ============================================================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function loadInitialData() {
  await loadMeetings();
  await loadDashboardStats();
}
