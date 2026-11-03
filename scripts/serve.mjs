// Preview the built website on your computer: node scripts/serve.mjs  ->  http://localhost:8080
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "./lib/util.mjs";

const DIR = path.join(ROOT, "_site");
const PORT = Number(process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    let file = path.join(DIR, p);
    if (!file.startsWith(DIR)) return res.writeHead(403).end();
    if (!fs.existsSync(file) && fs.existsSync(`${file}/index.html`)) file = `${file}/index.html`;
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      return res.end(fs.existsSync(path.join(DIR, "404.html")) ? fs.readFileSync(path.join(DIR, "404.html")) : "Not found");
    }
    const body = fs.readFileSync(file);
    const gz = /gzip/.test(req.headers["accept-encoding"] || "") && /\.(html|css|js|json|svg|xml)$/.test(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache", ...(gz ? { "content-encoding": "gzip" } : {}) });
    res.end(gz ? zlib.gzipSync(body) : body);
  })
  .listen(PORT, () => console.log(`The Simplest News preview: http://localhost:${PORT}`));
