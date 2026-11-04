import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site');
http.createServer(async(req,res)=>{
  const request=new URL(req.url,'http://127.0.0.1:4174');
  if(request.pathname.startsWith('/.netlify/')){
    res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({message:'Use the deployed church website to sign in.'}));
  }
  let filename=path.resolve(root,'.'+decodeURIComponent(request.pathname));
  if(!filename.startsWith(root+path.sep)&&filename!==root){res.writeHead(403);return res.end()}
  if(request.pathname.endsWith('/'))filename=path.join(filename,'index.html');
  try{const data=await fs.readFile(filename);res.writeHead(200,{'Content-Type':filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.js')?'application/javascript':filename.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}
}).listen(4174,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4174/'));
