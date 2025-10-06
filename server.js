// Entire file replaced with a clean Express + Socket.IO server implementation
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const socketIO = require('socket.io');

// Single clean server implementation
const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const messagesPath = path.join(__dirname, 'messages.json');
const usersPath = path.join(__dirname, 'users.json');

// Load users and messages (create files if missing)
let users = [];
if (fs.existsSync(usersPath)) {
  try { users = JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch (e) { users = []; }
} else {
  fs.writeFileSync(usersPath, JSON.stringify([]));
}

let messages = [];
if (fs.existsSync(messagesPath)) {
  try { messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8')); } catch (e) { messages = []; }
} else {
  fs.writeFileSync(messagesPath, JSON.stringify([]));
}

const sessions = {}; // sessionId -> username
let serverListening = false;

// Helper: parse cookies from request header
function parseCookies(req) {
  const raw = req.headers && req.headers.cookie;
  const parsed = {};
  if (!raw) return parsed;
  raw.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    parsed[key] = decodeURIComponent(val);
  });
  return parsed;
}

function bindServer(port = PORT) {
  if (serverListening) return;
  server.listen(port, '0.0.0.0', () => {
    serverListening = true;
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

function unbindServer(cb) {
  if (!serverListening) { if (cb) cb(); return; }
  server.close((err) => { serverListening = false; if (err) console.error(err); if (cb) cb(err); });
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
});

// Admin endpoints before auth middleware
app.post('/unbind', (req, res) => {
  unbindServer(() => res.send('Port listener closed (server process still running)'));
});
app.post('/bind', (req, res) => { if (serverListening) return res.send('Port already listening'); bindServer(); res.send('Port listener started'); });
app.post('/shutdown', (req, res) => {
  res.send('Server shutting down...');
  try { io.emit('forceDisconnect'); } catch (e) {}
  if (io && typeof io.close === 'function') io.close(() => server.close(() => process.exit(0)));
  else server.close(() => process.exit(0));
});

// Simple auth middleware: only enforce for /api routes. Page loads are handled client-side via localStorage.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  // allow login, whoami, public search, proxy, register, and scramjet without header
  if (req.path === '/api/login' || req.path === '/api/whoami' || req.path === '/api/search' || req.path === '/api/proxy' || req.path === '/api/register' || req.path === '/api/scramjet') return next();
  const headerSession = req.headers['x-session-id'];
  if (!headerSession || !sessions[headerSession]) {
    console.log('[AUTH API] unauthorized for', req.path, 'header=', headerSession);
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log('[LOGIN] attempt for user:', username);
  if (!username || !password) return res.status(400).json({ success: false });
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ success: false });
  const sessionId = Math.random().toString(36).slice(2, 18);
  sessions[sessionId] = username;
  console.log('[LOGIN] success', username, 'sessionId=', sessionId);
  res.json({ success: true, sessionId });
});

// Registration endpoint: username, password, question, answer
app.post('/api/register', (req, res) => {
  const { username, password, question, answer } = req.body;
  console.log('[REGISTER] attempt for user:', username);
  if (!username || !password || !question || !answer) return res.status(400).json({ success: false, error: 'missing fields' });
  const exists = users.find(u => u.username === username);
  if (exists) return res.status(409).json({ success: false, error: 'username exists' });
  const newUser = { username, password, question, answer };
  users.push(newUser);
  try { fs.writeFileSync(usersPath, JSON.stringify(users, null, 2)); } catch (e) { console.error('failed to write users.json', e); }
  const sessionId = Math.random().toString(36).slice(2, 18);
  sessions[sessionId] = username;
  console.log('[REGISTER] success', username, 'sessionId=', sessionId);
  res.json({ success: true, sessionId });
});

app.get('/api/whoami', (req, res) => {
  const headerSession = req.headers['x-session-id'];
  console.log('[WHOAMI] header:', headerSession);
  const sid = headerSession;
  if (sid && sessions[sid]) return res.json({ username: sessions[sid] });
  console.log('[WHOAMI] unauthorized for sid=', sid);
  return res.status(401).json({});
});

// Simple search endpoint: searches messages and usernames for a substring
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ messages: [], users: [] });
  const matchedMessages = messages.filter(m => (m.message || '').toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q));
  const matchedUsers = users.filter(u => (u.username || '').toLowerCase().includes(q));
  res.json({ messages: matchedMessages.slice(-50), users: matchedUsers });
});

// Admin-only: clear all messages
app.post('/api/clear-messages', (req, res) => {
  const headerSession = req.headers['x-session-id'];
  if (!headerSession || !sessions[headerSession]) return res.status(401).json({ error: 'unauthorized' });
  const username = sessions[headerSession];
  if (username !== 'admin') return res.status(403).json({ error: 'forbidden' });
  messages = [];
  try { fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2)); } catch (e) { console.error('failed to write messages.json', e); }
  // notify connected clients to clear their chat
  try { io.emit('clearedMessages'); } catch (e) { }
  res.json({ success: true });
});

// Proxy Scram Jet README from GitHub (so the client doesn't run into CORS)
app.get('/api/scramjet', (req, res) => {
  const https = require('https');
  const rawUrl = 'https://raw.githubusercontent.com/MercuryWorkshop/scramjet/main/README.md';
  https.get(rawUrl, (ghRes) => {
    if (ghRes.statusCode !== 200) return res.status(502).json({ error: 'failed to fetch' });
    let body = '';
    ghRes.on('data', (chunk) => body += chunk.toString());
    ghRes.on('end', () => res.json({ readme: body }));
  }).on('error', (err) => res.status(502).json({ error: 'failed to fetch', details: err.message }));
});

// Simple GET proxy API: /api/proxy?url=<encoded-url>
app.get('/api/proxy', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url required' });
  try {
    const url = new URL(target);
    const https = require(url.protocol === 'https:' ? 'https' : 'http');
    https.get(target, (proxRes) => {
      let body = '';
      proxRes.on('data', (c) => body += c.toString());
      proxRes.on('end', () => {
        res.json({ status: proxRes.statusCode, headers: proxRes.headers, body });
      });
    }).on('error', (err) => res.status(502).json({ error: 'fetch failed', details: err.message }));
  } catch (e) {
    return res.status(400).json({ error: 'invalid url' });
  }
});

// Proxy view: streams content directly for simple browsing /proxy/view?url=
app.get('/proxy/view', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');
  try {
    const url = new URL(target);
    const https = require(url.protocol === 'https:' ? 'https' : 'http');
    https.get(target, (proxRes) => {
      res.writeHead(proxRes.statusCode, proxRes.headers);
      proxRes.pipe(res);
    }).on('error', (err) => res.status(502).send('fetch failed: ' + err.message));
  } catch (e) {
    return res.status(400).send('invalid url');
  }
});

let activeUsers = 0;

// Socket auth using auth payload
io.use((socket, next) => {
  const sid = (socket.handshake && socket.handshake.auth && socket.handshake.auth.sessionId) || (socket.handshake && socket.handshake.headers && socket.handshake.headers['x-session-id']);
  if (sid && sessions[sid]) {
    socket.username = sessions[sid];
    return next();
  }
  console.log('[SOCKET AUTH] unauthorized sid=', sid, 'handshake=', socket.handshake && socket.handshake.auth);
  return next(new Error('unauthorized'));
});

io.on('connection', (socket) => {
  activeUsers++; io.emit('activeUsers', activeUsers);
  // send only the last 5 messages to new clients
  socket.emit('chatHistory', messages.slice(-5));
  socket.on('chatMessage', (data) => {
    if (!data.message) return;
    const chatMessage = { username: socket.username || data.username || 'unknown', message: data.message, time: new Date().toLocaleTimeString() };
    messages.push(chatMessage);
    fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), () => {});
    io.emit('chatMessage', chatMessage);
  });
  // typing indicator: broadcast when a user is typing or stopped
  socket.on('typing', () => {
    try { socket.broadcast.emit('userTyping', { username: socket.username, typing: true }); } catch (e) {}
  });
  socket.on('stopTyping', () => {
    try { socket.broadcast.emit('userTyping', { username: socket.username, typing: false }); } catch (e) {}
  });
  socket.on('disconnect', () => { activeUsers--; io.emit('activeUsers', activeUsers); });
});

// Start listening
bindServer();