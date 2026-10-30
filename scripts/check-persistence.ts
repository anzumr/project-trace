// Read-only configuration probe. It never prints credentials or creates match results.
import '../apps/server/src/env';
import { createClient } from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!url||!key){console.error('Missing SUPABASE_URL or server-only SUPABASE_SECRET_KEY in root .env.');process.exitCode=1;}
else{
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  for(const table of ['profiles','match_results','match_participants','player_progress','player_stats']){
    const {error}=await client.from(table).select('*',{head:true,count:'exact'}).limit(0);
    if(error){console.error(`${table}: unavailable (code ${error.code || 'connection'}). Check project, key and migrations.`);process.exitCode=1;}
    else console.log(`${table}: reachable`);
  }
  if(!process.exitCode)console.log('Read-only table checks passed. This does not verify a live match finalization or player login.');
}
