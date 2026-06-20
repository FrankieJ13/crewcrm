const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=__dirname, PORT=8765;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(ROOT,p);
  if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end('no');}
  fs.readFile(fp,(e,buf)=>{ if(e){res.writeHead(404);return res.end('404 '+p);}
    res.writeHead(200,{'Content-Type':MIME[path.extname(fp).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'}); res.end(buf); });
}).listen(PORT,()=>console.log('serving on',PORT));
