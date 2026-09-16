import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import worker from '../server/worker.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const storage=path.join(root,'.sites-runtime','local-r2');
await fs.mkdir(storage,{recursive:true});
function safe(rootDir,key){const file=path.resolve(rootDir,key);if(!file.startsWith(rootDir+path.sep))throw Error('Invalid path');return file;}
const BUCKET={
 async put(key,value,options={}){const file=safe(storage,key);await fs.mkdir(path.dirname(file),{recursive:true});const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(value);await fs.writeFile(file,bytes);await fs.writeFile(file+'.metadata',JSON.stringify(options.httpMetadata||{}));},
 async get(key,options){const file=safe(storage,key);let bytes;try{bytes=await fs.readFile(file)}catch(error){if(error.code==='ENOENT')return null;throw error;}const metadata=JSON.parse(await fs.readFile(file+'.metadata','utf8'));const size=bytes.length;const etag='"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"';let range;const raw=options?.range?.get?.('range');const match=/^bytes=(\d+)-(\d*)$/.exec(raw||'');if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;bytes=bytes.subarray(start,end+1);range={offset:start,length:bytes.length};}return{body:bytes,size,range,httpEtag:etag,writeHttpMetadata(headers){headers.set('content-type',metadata.contentType||'application/octet-stream')}};},
 async delete(key){await fs.rm(safe(storage,key),{force:true});await fs.rm(safe(storage,key)+'.metadata',{force:true});}
};
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.mp3':'audio/mpeg','.woff2':'font/woff2','.md':'text/plain','.txt':'text/plain'};
const ASSETS={async fetch(request){let pathname=new URL(request.url).pathname;if(pathname==='/')pathname='/index.html';try{const file=safe(path.join(root,'web'),decodeURIComponent(pathname.slice(1)));const bytes=await fs.readFile(file);const range=/^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range')||'');const headers={'content-type':types[path.extname(file)]||'application/octet-stream','accept-ranges':'bytes'};if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;headers['content-range']=`bytes ${start}-${end}/${bytes.length}`;return new Response(bytes.subarray(start,end+1),{status:206,headers});}return new Response(bytes,{headers});}catch{return new Response('Not found',{status:404})}}};
const server=http.createServer(async(req,res)=>{try{const headers=new Headers();for(const[key,value]of Object.entries(req.headers)){if(value)headers.set(key,Array.isArray(value)?value.join(','):value);}const request=new Request('http://127.0.0.1:4173'+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await worker.fetch(request,{BUCKET,ASSETS},{});res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();}catch(error){console.error(error);res.writeHead(500);res.end('Temporary server error');}});
server.listen(4173,'127.0.0.1',()=>console.log('Birthday creator ready at http://127.0.0.1:4173/ (durable local test storage)'));
