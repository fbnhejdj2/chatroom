const io = require('socket.io-client');
const axios = require('axios');

(async () => {
  const login = await axios.post('http://127.0.0.1:3000/api/login', { username: 'admin', password: 'admin123' });
  const sessionId = login.data.sessionId;
  console.log('sessionId', sessionId);
  const socket = io('http://127.0.0.1:3000', { auth: { sessionId } });
  socket.on('connect', () => console.log('connected')); 
  socket.on('chatHistory', (messages) => { console.log('chatHistory length', messages.length); console.log(messages); socket.disconnect(); process.exit(0); });
  socket.on('connect_error', (err) => { console.error('connect_error', err); process.exit(1); });
})();
