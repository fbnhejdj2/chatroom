const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

// Paths
const messagesPath = path.join(__dirname, 'messages.json');
const usersPath = path.join(__dirname, 'users.json');

// Load existing messages
let messages = [];
if (fs.existsSync(messagesPath)) {
  try {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse messages.json:', err);
    messages = [];
  }
} else {
  fs.writeFileSync(messagesPath, JSON.stringify([]));
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!fs.existsSync(usersPath)) {
    return res.status(500).json({ success: false, error: 'User file not found' });
  }

  const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Socket.IO chat handler
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send chat history to new user
  socket.emit('chatHistory', messages);

  socket.on('chatMessage', (data) => {
    if (!data.username || !data.message) return;

    const chatMessage = {
      username: data.username,
      message: data.message
    };

    messages.push(chatMessage);

    // Save to messages.json
    fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), (err) => {
      if (err) {
        console.error('Error writing messages:', err);
      }
    });

    // Broadcast message
    io.emit('chatMessage', chatMessage);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});