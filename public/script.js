const chat = document.getElementById('chat');
const source = new EventSource('/events');

// Track shown messages to prevent duplicates
let shownMessages = new Set();

source.onmessage = function (event) {
const msg = JSON.parse(event.data);
const msgKey = `${msg.time}-${msg.user}-${msg.text}`;

// Skip duplicate messages
if (shownMessages.has(msgKey)) return;
shownMessages.add(msgKey);

const item = document.createElement('li');
item.textContent = `[${msg.time}] ${msg.user}: ${msg.text}`;
chat.appendChild(item);
};

function sendMessage() {
const user = document.getElementById('username').value;
const text = document.getElementById('message').value;
if (!user || !text) return;

fetch('/message', {
method: 'POST',
headers: {'Content-Type': 'application/json'},
body: JSON.stringify({ user, text })
});

document.getElementById('message').value = '';
}
