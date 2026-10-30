import './env';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createGameServer } from './server';
import { clientDirectory } from './net/http';

if(!existsSync(join(clientDirectory,'index.html')))throw new Error('Production build missing. Run npm.cmd run build first.');
const port=Number(process.env.PORT || 3001);
if(!Number.isInteger(port) || port<1 || port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
if(process.env.NODE_ENV==='production' && !process.env.ALLOWED_ORIGINS)throw new Error('Set ALLOWED_ORIGINS to the exact HTTPS origin before production deployment.');
const server=createGameServer({serveClient:true});
server.http.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({event:'production_listening',port,static:true})));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
