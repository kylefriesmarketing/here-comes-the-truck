// HERE COMES THE TRUCK — the shot receiver.
//
//   "C:\Users\kylef\tools\node\node.exe" tools/shot-receiver.mjs [port] [outDir]
//
// The Browser pane cannot composite a WebGL page, so `computer{screenshot}` and
// preview_screenshot both fail on it. But the page can photograph ITSELF: a WebGL drawing
// buffer is only cleared on COMPOSITE, so render() -> toDataURL() in the SAME synchronous
// task returns real pixels with no preserveDrawingBuffer and no second renderer. That is
// what window.__hct.shot() does. This catches the result and writes a PNG you can Read.
//
//   fetch('http://localhost:8457/shot?name=cab', { method:'POST', body: __hct.shot() })
//
// ⚠️ NEVER pipe the base64 back through a tool result — it blows the context window.
// ⚠️ This lives in THIS repo on purpose. The workspace-root receiver hardcodes port 8399
//    and concurrent sessions fight over it; one of them silently creates a directory
//    named after the port. Ours takes the port as argv[2] and prints the written path.

import { createServer } from 'http';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const PORT = parseInt(process.argv[2] || '8457', 10);
const OUT = process.argv[3] || join(process.env.TEMP || '.', 'truck-shots');
mkdirSync(OUT, { recursive: true });

createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot')
    .replace(/[^a-z0-9_-]/gi, '');
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const b64 = body.slice(body.indexOf(',') + 1);
      const file = join(OUT, name + '.png');
      writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log('wrote ' + file + '  (' + Math.round(b64.length * 0.75 / 1024) + ' KB)');
      res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' });
      res.end(file);
    } catch (e) {
      console.log('FAILED: ' + e.message);
      res.writeHead(500, cors); res.end(e.message);
    }
  });
}).listen(PORT, () => console.log(`shot receiver -> http://localhost:${PORT}   out: ${OUT}`));
