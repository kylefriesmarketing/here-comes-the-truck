// HERE COMES THE TRUCK — tiny static server (ES modules need http://, not file://)
// Run:  node serve.mjs   then open http://localhost:8456
//
// ⚠️ ROOT is built with fileURLToPath, NEVER `new URL('.', import.meta.url).pathname`.
// This workspace path contains a space ("New folder") and pathname keeps it as %20 —
// which 404s every single file while the server itself looks perfectly healthy.
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};
const PORT = process.env.PORT || 8456;

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    const data = await readFile(fp);
    res.writeHead(200, {
      'Content-Type': MIME[extname(fp)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('not found'); }
}).listen(PORT, () => console.log(`HERE COMES THE TRUCK -> http://localhost:${PORT}`));
