const chat = document.getElementById('chat');
const source = new EventSource('/events');

let shownMessages = new Set();

source.onmessage = function (event) {
  const msg = JSON.parse(event.data);
  const msgKey = `${msg.time}-${msg.user}-${msg.text}`;
  if (shownMessages.has(msgKey)) return;
  shownMessages.add(msgKey);

  const item = document.createElement('li');
  item.className = 'message';
  item.innerHTML = `<strong>${msg.user}</strong>: ${msg.text} <span class="timestamp">${msg.time}</span>`;
  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
};

function sendMessage() {
  const text = document.getElementById('message').value;
  if (!text) return;

  fetch('/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  document.getElementById('message').value = '';
}