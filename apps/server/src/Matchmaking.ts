import { randomUUID } from 'node:crypto';
import { isMode, type ModeId } from '@trace/shared';
import type { ActionReply, QueueState } from '@trace/shared/protocol';
import { Room } from './game/Room';
import type { Identity } from './auth';

export const BOT_WAIT_MS = 300_000;
export const RECONNECT_MS = 20_000;
export type QueuePeer = { id: string; identity: Identity; queue: (state: QueueState)=>void; attach: (room:Room,playerId:string)=>void };
type Entry = { peer: QueuePeer; mode:ModeId; accumulated:number; since:number; disconnectedAt?:number };
type Seat = { peer:QueuePeer; room:Room; playerId:string; disconnectedAt?:number };
const ok = ():ActionReply=>({ok:true});
const fail = (error:string):ActionReply=>({ok:false,error});

export class Matchmaking {
  private waiting=new Map<string,Entry>();
  private seats=new Map<string,Seat>();
  private roomTimes=new Map<Room,{created:number;finished?:number}>();
  constructor(private rooms:Map<string,Room>,private makeRoom:(kind:'public'|'ai')=>Room,private available:()=>boolean,private clock:()=>number=()=>performance.now()){}
  hasActivity(userId:string){return this.waiting.has(userId)||this.seats.has(userId);}
  ownsSeat(peer:QueuePeer){return this.seats.get(peer.identity.userId)?.peer.id===peer.id;}
  connect(peer:QueuePeer):boolean {
    const uid=peer.identity.userId, entry=this.waiting.get(uid), seat=this.seats.get(uid), now=this.clock();
    if((entry && entry.disconnectedAt===undefined && entry.peer.id!==peer.id)||(seat && seat.disconnectedAt===undefined && seat.peer.id!==peer.id))return false;
    this.expire(now);
    const currentEntry=this.waiting.get(uid), currentSeat=this.seats.get(uid);
    if(currentEntry){currentEntry.peer=peer;currentEntry.since=now;currentEntry.disconnectedAt=undefined;this.send(currentEntry);}
    else if(currentSeat){currentSeat.peer=peer;currentSeat.disconnectedAt=undefined;currentSeat.room.setConnected(currentSeat.playerId,true);peer.attach(currentSeat.room,currentSeat.playerId);}
    else peer.queue(this.idle());
    return true;
  }
  join(peer:QueuePeer,mode:unknown):ActionReply {
    if(!isMode(mode))return fail('Choose a valid character mode.');
    const uid=peer.identity.userId;
    if(this.seats.has(uid))return fail('Leave your current match first.');
    const previous=this.waiting.get(uid);
    if(previous){if(previous.peer.id!==peer.id)return fail('This account is already searching on another connection.');this.send(previous);return ok();}
    if(!this.available())return fail('Public play is temporarily unavailable. Try again later; private rooms remain available.');
    if(this.waiting.size>=256)return fail('Queue is at capacity.');
    const entry:Entry={peer,mode,accumulated:0,since:this.clock()};this.waiting.set(uid,entry);this.send(entry);this.pair();return ok();
  }
  cancel(peer:QueuePeer):ActionReply {
    const entry=this.waiting.get(peer.identity.userId);
    if(entry && entry.peer.id!==peer.id)return fail('Queue belongs to another connection.');
    if(this.seats.has(peer.identity.userId))return fail('A match was already found. Leave it from the match screen.');
    this.waiting.delete(peer.identity.userId);peer.queue(this.idle());return ok();
  }
  bot(peer:QueuePeer):ActionReply {
    const entry=this.waiting.get(peer.identity.userId);
    if(!entry || entry.peer.id!==peer.id || entry.disconnectedAt!==undefined)return fail('You are no longer in the human queue.');
    if(this.elapsed(entry)<BOT_WAIT_MS)return fail('The optional AI challenge unlocks after five minutes of connected search.');
    if(!this.available() || this.rooms.size>=100)return fail('Match capacity or result storage unavailable. Keep searching or cancel.');
    // No await between consuming the queue entry and reserving its AI room.
    this.launch([entry],'ai');return ok();
  }
  disconnect(peer:QueuePeer) {
    const now=this.clock(),entry=this.waiting.get(peer.identity.userId),seat=this.seats.get(peer.identity.userId);
    if(entry?.peer.id===peer.id && entry.disconnectedAt===undefined){entry.accumulated=this.elapsed(entry);entry.disconnectedAt=now;}
    if(seat?.peer.id===peer.id){seat.disconnectedAt=now;seat.room.setConnected(seat.playerId,false);}
  }
  leave(peer:QueuePeer) {
    const entry=this.waiting.get(peer.identity.userId);if(entry?.peer.id===peer.id)this.waiting.delete(peer.identity.userId);
    const seat=this.seats.get(peer.identity.userId);
    if(seat?.peer.id===peer.id){seat.room.forfeit(seat.playerId);seat.room.setConnected(seat.playerId,false);this.seats.delete(peer.identity.userId);this.cleanup(seat.room);}
    peer.queue(this.idle());
  }
  tick() {this.expire(this.clock());this.pair();for(const entry of this.waiting.values())if(entry.disconnectedAt===undefined)this.send(entry);}
  private elapsed(entry:Entry){return entry.accumulated+(entry.disconnectedAt===undefined?Math.max(0,this.clock()-entry.since):0);}
  private idle():QueueState{return{state:'idle',elapsedMs:0,botEligible:false,serverTime:Date.now()};}
  private send(entry:Entry){const elapsedMs=Math.floor(this.elapsed(entry));entry.peer.queue({state:entry.disconnectedAt===undefined?'searching':'reconnecting',elapsedMs,botEligible:entry.disconnectedAt===undefined&&elapsedMs>=BOT_WAIT_MS,mode:entry.mode,serverTime:Date.now()});}
  private pair(){
    if(!this.available())return;
    for(const entry of [...this.waiting.values()]){
      if(this.rooms.size>=100)return;
      if(!this.waiting.has(entry.peer.identity.userId)||entry.disconnectedAt!==undefined)continue;
      const other=[...this.waiting.values()].find(e=>e!==entry&&e.mode===entry.mode&&e.disconnectedAt===undefined);
      if(other)this.launch([entry,other],'public');
    }
  }
  private launch(entries:Entry[],kind:'public'|'ai'){
    const room=this.makeRoom(kind);room.mode=entries[0].mode;
    for(const entry of entries){
      const peer=entry.peer,playerId=randomUUID();room.add(playerId,peer.identity);
      this.waiting.delete(peer.identity.userId);this.seats.set(peer.identity.userId,{peer,room,playerId});
    }
    if(kind==='ai')room.addBot();
    this.rooms.set(room.code,room);this.roomTimes.set(room,{created:this.clock()});
    for(const entry of entries){entry.peer.queue(this.idle());const seat=this.seats.get(entry.peer.identity.userId)!;entry.peer.attach(room,seat.playerId);}
  }
  private expire(now:number){
    for(const room of this.roomTimes.keys())if(room.kind==='public'){
      const seats=[...this.seats.values()].filter(s=>s.room===room);
      if(seats.length===2 && seats.every(s=>s.disconnectedAt!==undefined && now-s.disconnectedAt>=RECONNECT_MS))room.cancel('Both players disconnected. Match cancelled.');
    }
    for(const [uid,entry] of this.waiting)if(entry.disconnectedAt!==undefined && now-entry.disconnectedAt>=RECONNECT_MS)this.waiting.delete(uid);
    for(const [uid,seat] of this.seats)if(seat.disconnectedAt!==undefined && now-seat.disconnectedAt>=RECONNECT_MS){seat.room.forfeit(seat.playerId);this.seats.delete(uid);this.cleanup(seat.room);}
    for(const [room,times] of this.roomTimes){
      if(room.phase==='lobby'&&now-times.created>=60_000)room.cancel('Match cancelled: ready confirmation timed out.');
      if(room.phase==='finished'){
        times.finished??=now;
        if(now-times.finished>=300_000){for(const [uid,seat] of this.seats)if(seat.room===room)this.seats.delete(uid);this.rooms.delete(room.code);this.roomTimes.delete(room);}
      }
    }
  }
  private cleanup(room:Room){if(![...this.seats.values()].some(s=>s.room===room)){this.rooms.delete(room.code);this.roomTimes.delete(room);}}
}
