import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const origin = process.argv[2] || 'http://localhost:5173';
const clients = [];
try {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Project Trace/);
  for (let i = 0; i < 2; i++) {
    const socket = io(origin, { transports: ['websocket'], reconnection: false, extraHeaders: { Origin: origin }, timeout: 3000 });
    clients.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  }
  const made = await clients[0].timeout(3000).emitWithAck('create');
  assert.equal(made.ok, true);
  const joined = await clients[1].timeout(3000).emitWithAck('join', made.snapshot.code);
  assert.equal(joined.ok, true); assert.equal(joined.snapshot.players.length, 2);
  console.log('PASS: HTTP page and two WebSocket clients through Vite proxy with browser Origin.');
} finally { clients.forEach(client => client.disconnect()); }
