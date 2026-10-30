import { io, type Socket } from 'socket.io-client';
import type { ModeId } from '@trace/shared';
import type { ClientEvents, ServerEvents, PlayerInput, RoomReply, Snapshot, QueueState, ActionReply } from '@trace/shared/protocol';

export class Network {
  readonly socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 2000, transports: ['websocket', 'polling'] });
  private seat: string | undefined;
  private cancelPending = false;
  queue: QueueState = { state: 'idle', elapsedMs: 0, botEligible: false, serverTime: 0 };
  private queueState = (state: QueueState) => { this.queue = state; this.onQueue(state); };
  private samples: { received: number; snapshot: Snapshot }[] = [];
  snapshot: Snapshot | null = null;
  ping = 0;
  private received = 0;
  private accountId: string | null = null;
  private rememberPublic(active: boolean) { try { if(active && this.accountId)sessionStorage.setItem('trace.public',this.accountId); else sessionStorage.removeItem('trace.public'); } catch { /* Reload recovery unavailable when storage is disabled. */ } }
  setAccount(userId: string | null, token?: string) {
    const changed = userId !== this.accountId;
    this.accountId = userId;
    this.socket.auth = token ? { token } : {};
    if (changed) { const wasInRoom = !!this.snapshot; if(this.socket.connected)this.socket.emit('leave'); this.socket.disconnect(); this.clear(); this.queueState({state:'idle',elapsedMs:0,botEligible:false,serverTime:0}); if (wasInRoom) this.error('Account changed. The room ended; create or join a new room.'); }
    else if (token && this.socket.connected) this.socket.timeout(20000).emit('authenticate', token, (error, ok) => {
      if (error || !ok) { this.socket.disconnect(); this.clear(); this.error('Session verification failed. Sign in again before rejoining.'); }
    });
    if(changed && userId) { try { if(sessionStorage.getItem('trace.public')===userId)void this.connect().catch(e=>this.error(e.message)); } catch { /* Private browser storage. */ } }
  }
  get snapshotAge() { return this.snapshot ? performance.now()-this.received : 0; }
  private pingTimer: ReturnType<typeof setInterval>;
  constructor(private update: (state: Snapshot | null) => void, private error: (message: string) => void, private apply: (state: Snapshot) => void, private onQueue: (state: QueueState)=>void = ()=>{}) {
    this.socket.on('queue', this.queueState);
    this.socket.on('seat', id => { this.seat = id; });
    this.socket.on('connect', () => { this.error(''); if(this.cancelPending){this.cancelPending=false;void this.cancelQueue();} });
    this.socket.on('snapshot', this.receive);
    this.socket.on('notice', error);
    this.socket.on('disconnect', reason => {
      const publicMatch = this.snapshot && this.snapshot.kind !== 'private';
      if(this.queue.state!=='idle')this.queueState({...this.queue,state:'reconnecting',botEligible:false});
      this.clear();
      if (reason !== 'io client disconnect') error(publicMatch || this.queue.state!=='idle' ? 'Reconnecting… public play is paused for up to 20 seconds. Session expiry may require signing in again.' : 'Connection interrupted or session expired. Rejoin your private room.');
    });
    this.pingTimer = setInterval(() => { if (!this.socket.connected) return; const start = performance.now(); this.socket.timeout(2000).emit('pingCheck', err => { if (!err) this.ping = performance.now() - start; }); }, 2000);
  }
  get id() { return this.seat ?? this.socket.id; }
  private receive = (snapshot: Snapshot) => { this.received=performance.now();this.snapshot = snapshot; this.samples.push({ received: this.received, snapshot }); if (this.samples.length > 10) this.samples.shift(); this.apply(snapshot); this.update(snapshot); };
  private async connect() {
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Server unavailable. Start both client and server with npm.cmd run dev.')), this.accountId ? 20000 : 5000);
      const success = () => finish(); const fail = (error: Error) => finish(new Error(error.message.startsWith('Account') ? error.message : 'Server unavailable. Start both client and server with npm.cmd run dev.'));
      const finish = (err?: Error) => { clearTimeout(timer); this.socket.off('connect', success); this.socket.off('connect_error', fail); if (err) { this.socket.disconnect(); reject(err); } else resolve(); };
      this.socket.once('connect', success); this.socket.once('connect_error', fail); this.socket.connect();
    });
  }
  async room(code?: string, name?: string) {
    try {
      // Revalidate account/profile on each new room, including a recent rename.
      if (this.accountId && !this.snapshot) this.socket.disconnect();
      await this.connect();
      const reply = await new Promise<RoomReply>((resolve, reject) => {
        const ack = (err: Error | null, result: RoomReply) => err ? reject(new Error('Server did not respond. Try again.')) : resolve(result);
        if (code === undefined) this.socket.timeout(5000).emit('create', ack); else this.socket.timeout(5000).emit('join', code.trim().toUpperCase(), ack);
      });
      if (!reply.ok || !reply.snapshot) throw new Error(reply.error || 'Could not enter room.');
      this.receive(reply.snapshot);
      if (name) this.socket.emit('setName', name);
    } catch (err) { this.error(err instanceof Error ? err.message : 'Connection failed.'); }
  }
  async findMatch(mode: ModeId) {
    try { await this.connect(); const result = await this.socket.timeout(5000).emitWithAck('queueJoin',mode); if(!result.ok)throw new Error(result.error); this.rememberPublic(true); this.error(''); }
    catch(error){this.error(error instanceof Error ? error.message : 'Could not enter queue.');}
  }
  async cancelQueue() {
    if(!this.socket.connected){this.cancelPending=true;this.error('Cancellation will be sent when reconnected; disconnected queue entries expire after 20 seconds.');return;}
    try {const result:ActionReply=await this.socket.timeout(5000).emitWithAck('queueCancel');if(!result.ok)throw new Error(result.error);this.rememberPublic(false);this.error('');}
    catch(error){this.error(error instanceof Error?error.message:'Could not cancel. Retry.');}
  }
  async challengeBot() {
    if(!this.socket.connected){this.error('Reconnect before accepting the AI challenge.');return;}
    try {const result=await this.socket.timeout(5000).emitWithAck('queueBot');if(!result.ok)throw new Error(result.error);this.error('');}
    catch(error){this.error(error instanceof Error?error.message:'Could not start AI match.');}
  }
  send(input: PlayerInput) { if (this.socket.connected && this.snapshot) this.socket.emit('input', input); }
  ready() { if (this.snapshot) this.socket.emit('ready', this.snapshot.modeRevision); }
  selectMode(mode: ModeId) { this.socket.emit('selectMode', mode); }
  leave() { this.socket.emit('leave'); this.rememberPublic(false); this.clear(); }
  private clear() { this.snapshot = null; this.seat = undefined; this.samples = []; this.update(null); }
  remote(now: number) {
    const id = this.id, latest = this.snapshot?.players.find(p => p.id !== id); if (!latest) return null;
    const time = now - 100;
    const valid = this.samples.filter(s => s.snapshot.match === this.snapshot?.match && s.snapshot.roundSerial === this.snapshot?.roundSerial);
    let a = valid[0], b = valid[valid.length - 1];
    if (!a || !b) return latest;
    for (let i = 1; i < valid.length; i++) { if (valid[i].received >= time) { a = valid[i - 1]; b = valid[i]; break; } }
    const from = a.snapshot.players.find(p => p.id !== id), to = b.snapshot.players.find(p => p.id !== id);
    if (!from || !to) return latest;
    const t = Math.max(0, Math.min(1, (time - a.received) / Math.max(1, b.received - a.received)));
    return { ...latest, body: { ...latest.body, x: from.body.x + (to.body.x - from.body.x) * t, y: from.body.y + (to.body.y - from.body.y) * t, z: from.body.z + (to.body.z - from.body.z) * t } };
  }
  dispose() { clearInterval(this.pingTimer); this.socket.removeAllListeners(); this.socket.disconnect(); }
}
