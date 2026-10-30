import { readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
async function compress(directory) { for(const item of await readdir(directory,{withFileTypes:true})){const path=join(directory,item.name);if(item.isDirectory())await compress(path);else if(/\.(js|css|html|svg)$/.test(path)){const data=await readFile(path);await writeFile(path+'.gz',gzipSync(data,{level:9}));}} }
await compress('apps/client/dist');console.log('Prepared gzip assets for the production server.');
