// Local web server: library UI + JSON API + range-capable media streaming. Binds to 127.0.0.1 only.
import http from 'node:http';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.json': 'application/json' };

export function startServer({ port, uiDir, library, status }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const p = url.pathname;
      if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(uiDir, 'index.html'));
      if (p.startsWith('/ui/')) return sendFile(req, res, path.join(uiDir, p.slice(4)));
      if (p.startsWith('/media/')) return sendFile(req, res, path.join(library.dir, decodeURIComponent(p.slice(7))));
      if (p === '/api/status') return json(res, status());
      if (p === '/api/recordings' && req.method === 'GET') return json(res, await library.list());
      const m = p.match(/^\/api\/recordings\/([^/]+)(?:\/(favorite|clip|clips\/([^/]+)))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!m[2] && req.method === 'GET') return json(res, await library.get(id));
        if (!m[2] && req.method === 'DELETE') { await library.remove(id); return json(res, { ok: true }); }
        if (m[2] === 'favorite' && req.method === 'POST') { const meta = await library.get(id); meta.favorite = !meta.favorite; return json(res, await library.save(meta)); }
        if (m[2] === 'clip' && req.method === 'POST') { const b = await body(req); return json(res, await library.makeClip(id, Number(b.start), Number(b.end), { precise: !!b.precise, name: b.name })); }
        if (m[2]?.startsWith('clips/') && req.method === 'DELETE') return json(res, await library.removeClip(id, decodeURIComponent(m[3])));
      }
      res.writeHead(404); res.end('not found');
    } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
  });
  server.listen(port, '127.0.0.1');
  return server;
}

function json(res, data) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); }
async function body(req) { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; }

async function sendFile(req, res, file) {
  if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  const st = await fs.stat(file);
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const [a, b] = range.replace('bytes=', '').split('-');
    const start = Number(a), end = b ? Number(b) : Math.min(start + 8 * 1024 * 1024, st.size - 1);
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
  createReadStream(file).pipe(res);
}
