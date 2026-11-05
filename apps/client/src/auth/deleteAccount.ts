import { io, type Socket } from 'socket.io-client';
import type { ActionReply, ClientEvents, ServerEvents } from '@trace/shared/protocol';

/** Asks the game server, which holds the secret key and knows who is mid-match, to delete the token's account. */
export async function deleteAccount(token: string): Promise<ActionReply> {
  // A guest connection, so this never displaces the account's own game connection.
  const socket: Socket<ServerEvents, ClientEvents> = io({ reconnection: false, transports: ['websocket', 'polling'] });
  try {
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return await socket.timeout(20000).emitWithAck('deleteAccount', token);
  } catch { return { ok: false, error: 'The game server did not respond. Check your connection and try again.' }; }
  finally { socket.disconnect(); }
}
