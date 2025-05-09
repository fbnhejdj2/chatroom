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

if (fs.existsSync(messagesPath)) {
  try {
    messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
  } catch {
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
  socket.emit('chatHistory', messages);

  socket.on('chatMessage', (data) => {
    if (!data.username || !data.message) return;
    const chatMessage = {
      username: data.username,
      message: data.message
    };
    messages.push(chatMessage);
    fs.writeFile(messagesPath, JSON.stringify(messages, null, 2), (err) => {
      if (err) console.error('Write error:', err);
    });
    io.emit('chatMessage', chatMessage);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});