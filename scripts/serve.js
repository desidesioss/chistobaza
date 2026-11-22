import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(file) {
  return types[path.extname(file).toLowerCase()] || "application/octet-stream";
}

function safeFile(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^[/\\]+/, "");
  if (rel.split(/[/\\]/).includes("..")) return null;
  const file = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) return null;
  return file;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  let file = safeFile(url.pathname);
  const send = (status, body, type) => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(body);
  };
  const fail = () => {
    fs.readFile(path.join(root, "404.html"), (error, page) => {
      send(404, error ? "Not found" : page, "text/html; charset=utf-8");
    });
  };
  if (!file) {
    send(400, "Bad path", "text/plain; charset=utf-8");
    return;
  }
  fs.stat(file, (error, stat) => {
    if (!error && stat.isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { Location: `${url.pathname}/` });
        res.end();
        return;
      }
      file = path.join(file, "index.html");
    }
    fs.readFile(file, (readError, data) => {
      if (readError) {
        fail();
        return;
      }
      send(200, data, contentType(file));
    });
  });
});

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const ip4 = net.family === "IPv4" || net.family === 4;
      if (!ip4 || net.internal) continue;
      found.push(net.address);
    }
  }
  return found;
}

server.listen(port, "0.0.0.0", () => {
  console.log(`На этом компьютере: http://127.0.0.1:${port}/`);
  for (const address of lanAddresses()) {
    console.log(`С другого устройства в этой сети: http://${address}:${port}/`);
  }
});
