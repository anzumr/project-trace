import './env';
import { createGameServer } from './server';
const game = createGameServer();
const port = Number(process.env.PORT || 3001);
game.http.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', port })));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void game.close().then(() => process.exit(0)); });
