// Minimaler statischer Server ohne Abhängigkeiten
// Start: node scripts/static-server.mjs [port]
import http from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || '8080', 10);
const ROOT = path.resolve(__dirname, '..', 'apps', 'configurator');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif'
};

function safeJoin(root, p) {
  const fp = path.resolve(root, '.' + p);
  if (!fp.startsWith(root)) return root; // directory traversal guard
  return fp;
}

const server = http.createServer(async (req, res) => {
  try {
    let reqPath = (req.url || '/').split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = safeJoin(ROOT, reqPath);
    const st = await stat(filePath);
    if (st.isDirectory()) {
      const idx = path.join(filePath, 'index.html');
      const buf = await readFile(idx);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const buf = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Static server on http://localhost:${PORT}`);
  console.log(`Serving ${ROOT}`);
});

