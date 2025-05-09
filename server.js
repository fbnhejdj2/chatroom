const express = require('express');
const http = require('http');
const fs = require('fs');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = 3000;

const messagesPath = path.join(__dirname, 'messages.json');
let messages = [];

// Load existing messages
if (fs.existsSync(messagesPath)) {
  try {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  } catch (err) {
    console.error('Error reading messages.json:', err);
    messages = [];
  }
} else {
  fs.writeFileSync(messagesPath, JSON.stringify([]));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

io.on('connection', (socket) => {
  console.log('User connected');
  socket.emit('chatHistory', messages);

  socket.on('chatMessage', (msg) => {
    messages.push(msg);
    fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), (err) => {
      if (err) console.error('Failed to write messages:', err);
    });
    io.emit('chatMessage', msg);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});