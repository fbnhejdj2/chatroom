// Clean client script: localStorage session, socket auth, chat UI, tabs, search and proxy
(function(){
  function getSession() {
    return { sessionId: localStorage.getItem('sessionId'), username: localStorage.getItem('username') };
  }

  function requireLogin() {
    const s = getSession();
    if (!s.sessionId || !s.username) { window.location.href = '/login'; return null; }
    return s;
  }

  const session = requireLogin();
  if (!session) return;

  const socket = io({ auth: { sessionId: session.sessionId } });

  const messagesDiv = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const userCountSpan = document.getElementById('user-count');
  const logoutButton = document.getElementById('logout-button');
  const chatTabButton = document.getElementById('chat-tab');

  function addMessageToChat(data) {
    if (!messagesDiv) return;
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<strong>${data.username}</strong>: ${data.message} <span class="timestamp">${data.time || ''}</span>`;
    messagesDiv.appendChild(div);
    while (messagesDiv.children.length > 5) messagesDiv.removeChild(messagesDiv.firstChild);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    // If message is from someone else and the user is not focused on the page or not on the chat tab, increment unread
    const isChatTabActive = chatTabButton && chatTabButton.classList.contains('active');
    if ((data.username !== (session && session.username)) && (!document.hasFocus() || !isChatTabActive)) {
      incrementUnread();
    }
  }

  // Unread counter and tab badge
  let unreadCount = 0;
  function updateTabBadge() {
    if (!chatTabButton) return;
    // remove existing badge
    const existing = chatTabButton.querySelector('.badge');
    if (existing) existing.remove();
    if (unreadCount > 0) {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = unreadCount;
      chatTabButton.appendChild(span);
      document.title = `(${unreadCount}) Chatroom`;
    } else {
      document.title = 'Chatroom';
    }
  }

  function incrementUnread() { unreadCount++; updateTabBadge(); }
  function clearUnread() { unreadCount = 0; updateTabBadge(); }

  socket.on('connect_error', (err) => {
    console.error('socket connect_error', err);
    if (err && err.message === 'unauthorized') { localStorage.removeItem('sessionId'); localStorage.removeItem('username'); window.location.href = '/login'; }
  });

  socket.on('activeUsers', (c) => { if (userCountSpan) userCountSpan.textContent = `Active users: ${c}`; });
  socket.on('chatHistory', (msgs) => { msgs.forEach(addMessageToChat); });
  socket.on('chatMessage', (m) => addMessageToChat(m));

  // notify on new messages: desktop notification if page not focused, and small toast + sound
  function showToast(text) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.textContent = text;
    t.style.background = 'rgba(0,0,0,0.8)';
    t.style.color = 'white';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '6px';
    t.style.marginTop = '6px';
    t.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    container.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; setTimeout(() => container.removeChild(t), 450); }, 3500);
  }

  const notifAudio = document.getElementById('notif-sound');

  socket.on('chatMessage', (m) => {
    // always show toast
    showToast(`${m.username}: ${m.message}`);
    // play sound
    try { if (notifAudio && typeof notifAudio.play === 'function') notifAudio.play().catch(()=>{}); } catch(e){}
    // desktop notification when not focused
    if (document.hidden) {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(`New message from ${m.username}`, { body: m.message });
      } else if (window.Notification && Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') new Notification(`New message from ${m.username}`, { body: m.message }); });
      }
    }
  });

  // Listen for server signal that messages were cleared
  socket.on('clearedMessages', () => {
    if (messagesDiv) messagesDiv.innerHTML = '';
  });

  if (messageForm) {
    messageForm.addEventListener('submit', (e) => { e.preventDefault(); const txt = messageInput.value.trim(); if (!txt) return; socket.emit('chatMessage', { message: txt }); messageInput.value = ''; socket.emit('stopTyping'); });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => { localStorage.removeItem('sessionId'); localStorage.removeItem('username'); window.location.href = '/login'; });
  }

  // Show admin-only clear button
  const clearBtn = document.getElementById('clear-messages-button');
  if (clearBtn) {
    if (session && session.username === 'admin') {
      clearBtn.style.display = '';
    } else {
      clearBtn.style.display = 'none';
    }
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Really clear all messages? This cannot be undone.')) return;
      const sid = localStorage.getItem('sessionId');
      const res = await fetch('/api/clear-messages', { method: 'POST', headers: { 'x-session-id': sid || '' } });
      if (res.ok) {
        // server emits 'clearedMessages' which will clear the DOM for everyone; also clear local messages div
        messagesDiv.innerHTML = '';
      } else {
        const j = await res.json().catch(() => ({}));
        alert('Failed to clear messages: ' + (j && j.error ? j.error : res.statusText));
      }
    });
  }

  // typing indicator wiring: emit typing events while user types
  (function wireTyping() {
    if (!messageInput) return;
    let typing = false;
    let lastEmit = 0;
    const TYPING_TIMEOUT = 1500;
    let timeoutId = null;
    function sendTyping() {
      const now = Date.now();
      if (!typing) { typing = true; socket.emit('typing'); }
      lastEmit = now;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => { typing = false; socket.emit('stopTyping'); timeoutId = null; }, TYPING_TIMEOUT);
    }
    messageInput.addEventListener('input', () => {
      sendTyping();
    });
    // also stop typing on blur
    messageInput.addEventListener('blur', () => { if (typing) { typing = false; socket.emit('stopTyping'); } });
  })();

  // show typing indicator when other users type
  const typingIndicator = document.getElementById('typing-indicator');
  let typingUsers = new Set();
  socket.on('userTyping', (p) => {
    if (!p || !p.username) return;
    if (p.typing) {
      typingUsers.add(p.username);
    } else {
      typingUsers.delete(p.username);
    }
    if (typingIndicator) {
      if (typingUsers.size > 0) { typingIndicator.style.display = ''; typingIndicator.textContent = Array.from(typingUsers).join(', ') + ' is typing...'; }
      else { typingIndicator.style.display = 'none'; typingIndicator.textContent = '' }
    }
  });

  // Home UI: search, proxy and tabs
  function initHome() {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const resultsDiv = document.getElementById('search-results');
    const proxyInput = document.getElementById('proxy-input');
    const proxyView = document.getElementById('proxy-view');

    async function doSearch() {
      const q = (searchInput && searchInput.value || '').trim(); if (!q) return;
      const sid = localStorage.getItem('sessionId');
      const headers = sid ? { 'x-session-id': sid } : {};
      const res = await fetch('/api/search?q=' + encodeURIComponent(q), { headers });
      const data = await res.json();
      resultsDiv.innerHTML = '';
      if (data.users && data.users.length) { const h = document.createElement('h4'); h.textContent = 'Users'; resultsDiv.appendChild(h); data.users.forEach(u => { const d = document.createElement('div'); d.textContent = u.username; resultsDiv.appendChild(d); }); }
      if (data.messages && data.messages.length) { const h = document.createElement('h4'); h.textContent = 'Messages'; resultsDiv.appendChild(h); data.messages.forEach(m => { const d = document.createElement('div'); d.textContent = `${m.username}: ${m.message}`; resultsDiv.appendChild(d); }); }
      if ((!data.users || !data.users.length) && (!data.messages || !data.messages.length)) resultsDiv.textContent = 'No results';
    }

    if (searchButton) searchButton.addEventListener('click', doSearch);
    if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

    if (proxyView) {
      proxyView.addEventListener('click', () => {
        const url = (proxyInput && proxyInput.value || '').trim(); if (!url) return alert('Enter a URL');
        // open proxy view in new tab for full browsing
        const win = window.open('/proxy/view?url=' + encodeURIComponent(url), '_blank');
        if (!win) { // fallback: fetch and render
          fetch('/api/proxy?url=' + encodeURIComponent(url)).then(r => r.json()).then(j => {
            const iframe = document.getElementById('proxy-iframe'); if (iframe) iframe.innerHTML = j.body || 'No content';
          }).catch(err => { const iframe = document.getElementById('proxy-iframe'); if (iframe) iframe.textContent = 'Proxy failed: ' + err.message; });
        }
      });
      if (proxyInput) proxyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); proxyView.click(); } });
    }

    // tabs
    const chatTab = document.getElementById('chat-tab');
    const homeTab = document.getElementById('home-tab');
    const chatContent = document.getElementById('chatroom-content');
    const homeContent = document.getElementById('home-content');
    let scramjetLoaded = false;
    if (chatTab && homeTab) {
      chatTab.addEventListener('click', () => { chatTab.classList.add('active'); homeTab.classList.remove('active'); chatContent.style.display = ''; homeContent.style.display = 'none'; clearUnread(); });
      homeTab.addEventListener('click', async () => {
        homeTab.classList.add('active'); chatTab.classList.remove('active'); chatContent.style.display = 'none'; homeContent.style.display = '';
        if (!scramjetLoaded) {
          scramjetLoaded = true;
          const readmeDiv = document.getElementById('scramjet-readme');
          if (readmeDiv) readmeDiv.textContent = 'Loading Scram Jet README...';
          try {
            const res = await fetch('/api/scramjet');
            if (!res.ok) throw new Error('fetch failed: ' + res.status);
            const j = await res.json();
            if (readmeDiv) readmeDiv.textContent = j.readme || 'No README found.';
          } catch (e) {
            if (readmeDiv) readmeDiv.textContent = 'Failed to load Scram Jet README: ' + (e && e.message ? e.message : e);
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHome); else initHome();

  // Clear unread when window gains focus
  window.addEventListener('focus', () => { clearUnread(); });
  // Also clear when user switches back to the document (visibilitychange)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) clearUnread(); });

})();