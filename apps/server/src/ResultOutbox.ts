import { mkdir, readdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { MatchResult } from './game/Results';
import type { Snapshot } from '@trace/shared/protocol';

export type ResultSink = (result: MatchResult) => Promise<void>;
export function providerResultSink(): ResultSink | undefined {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const client = createClient(url,key,{ auth:{persistSession:false,autoRefreshToken:false}, global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})} });
  return async result => { const {error}=await client.rpc('record_match',{p_result:result}); if(error)throw new Error('Result database unavailable or rejected finalization'); };
}

// Durable single-server retry queue. Only the trusted process constructs payloads.
export class ResultOutbox {
  private pending = new Map<string, { result: MatchResult; status?: (state: Snapshot['resultState'])=>void }>();
  private busy = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval>;
  private writes = new Set<Promise<void>>();
  readonly ready: Promise<void>;
  healthy = true;
  get available() { return !!this.sink && this.healthy && this.pending.size < 1000; }
  constructor(private directory: string, private sink?: ResultSink) {
    this.ready = this.restore().catch(()=>{this.healthy=false;console.error('Result outbox could not load. Public queue disabled.');});
    this.timer=setInterval(()=>void this.flush(),5000); this.timer.unref();
  }
  private async restore() {
    if (!this.sink) return;
    await mkdir(this.directory,{recursive:true});
    for(const name of await readdir(this.directory)) if (/^[0-9a-f-]{36}\.json$/.test(name)) {
      const result:MatchResult=JSON.parse(await readFile(join(this.directory,name),'utf8'));
      if(result.id+'.json'!==name)throw new Error('Invalid outbox entry');
      this.pending.set(result.id,{result});
    }
  }
  enqueue(result:MatchResult, status:(state:Snapshot['resultState'])=>void) {
    if (!this.sink) {status('unavailable');return;}
    status('pending');
    const task=(async()=>{
      await this.ready;
      if(this.pending.has(result.id))return;
      const entry={result,status}; this.pending.set(result.id,entry);
      const path=join(this.directory,result.id+'.json');
      try { await writeFile(path+'.tmp',JSON.stringify(result),{mode:0o600,flush:true}); await rename(path+'.tmp',path); }
      catch {this.healthy=false;status('retrying');console.error('Result outbox write failed. Public queue disabled; result retained in memory.');}
    })();
    this.writes.add(task); void task.finally(()=>{this.writes.delete(task);void this.flush();});
  }
  async flush() {
    await this.ready;
    if(this.busy || !this.sink || this.stopped)return;
    this.busy=true;
    try {
      await Promise.all([...this.writes]);
      for(const [id,entry] of this.pending) {
        if(this.stopped)break;
        try {
          await this.sink(entry.result);
          await unlink(join(this.directory,id+'.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
          this.pending.delete(id);entry.status?.('saved');
        } catch {entry.status?.('retrying');break;}
      }
    } finally {this.busy=false;}
  }
  async close() { clearInterval(this.timer); this.stopped=true; await this.ready; await Promise.all([...this.writes]); while(this.busy)await new Promise(resolve=>setTimeout(resolve,20)); }
}
