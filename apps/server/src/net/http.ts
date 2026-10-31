import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const types: Record<string,string> = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.ogg':'audio/ogg','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2' };
export function authConnectSource() {
  if (!process.env.SUPABASE_URL) return '';
  const url = new URL(process.env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('SUPABASE_URL must be an HTTPS project URL.');
  return ' ' + url.origin;
}
export const clientDirectory=fileURLToPath(new URL('../../../client/dist/',import.meta.url));
export async function serveHttp(req: IncomingMessage, res: ServerResponse, staticEnabled: boolean) {
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  let pathname: string;
  try {pathname=decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
  if(pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify({service:'trace',ok:true}));return;}
  if(!staticEnabled){res.writeHead(404);res.end();return;}
  const root=resolve(clientDirectory), path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root+sep) || pathname.includes('\\') || !types[extname(path)]){res.writeHead(404);res.end();return;}
  try {
    let selected=path, info=await stat(path); if(!info.isFile())throw new Error('Not a file');
    if(/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {try {const zipped=await stat(path+'.gz');if(zipped.isFile()){selected=path+'.gz';info=zipped;res.setHeader('Content-Encoding','gzip');}}catch{/* uncompressed fallback */}}
    res.setHeader('Content-Type',types[extname(path)]);res.setHeader('Vary','Accept-Encoding');res.setHeader('Content-Length',info.size);
    res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${authConnectSource()}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(selected);stream.on('error',()=>res.destroy());stream.pipe(res);
  } catch {res.writeHead(404);res.end();}
}
