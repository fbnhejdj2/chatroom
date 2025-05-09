const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, 'users.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

let messages = [];
let clients = [];

if (fs.existsSync(MESSAGES_FILE)) {
  messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8') || '[]');
}

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'discord-style-chat-secret',
  resave: false,
  saveUninitialized: true
}));

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login.html');
}

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    req.session.user = username;
    res.redirect('/');
  } else {
    res.send('Login failed. <a href="/login.html">Try again</a>');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login.html'));
});

// Serve chat page only if logged in
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/events', isAuthenticated, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);
  messages.forEach(msg => res.write(`data: ${JSON.stringify(msg)}\n\n`));

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

app.post('/message', isAuthenticated, (req, res) => {
  const msg = {
    user: req.session.user,
    text: req.body.text,
    time: new Date().toLocaleTimeString()
  };
  messages.push(msg);

  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  clients.forEach(client => client.write(`data: ${JSON.stringify(msg)}\n\n`));
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Chat server running on port ${PORT}`));