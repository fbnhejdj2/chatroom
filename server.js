const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const MESSAGES_FILE = path.join(__dirname, 'messages.json');

let messages = [];
let clients = [];

// Load messages from file
if (fs.existsSync(MESSAGES_FILE)) {
const fileData = fs.readFileSync(MESSAGES_FILE, 'utf8');
try {
messages = JSON.parse(fileData);
} catch (e) {
messages = [];
}
}

app.use(express.static('public'));
app.use(express.json());

app.get('/events', (req, res) => {
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

app.post('/message', (req, res) => {
const msg = {
user: req.body.user,
text: req.body.text,
time: new Date().toLocaleTimeString()
};
messages.push(msg);

// Save messages to file
fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), err => {
if (err) console.error('Error writing messages:', err);
});

clients.forEach(client => client.write(`data: ${JSON.stringify(msg)}\n\n`));
res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Chat server running on port ${PORT}`));
