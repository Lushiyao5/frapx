import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".glsl": "text/plain; charset=utf-8",
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
  ".bin": "application/octet-stream"
};

export type StaticServer = { url: string; close(): Promise<void> };

/** Serves `root` on 127.0.0.1 at a free port. Directories resolve to their index.html. */
export const serveDirectory = async (root: string): Promise<StaticServer> => {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
      let file = resolve(join(base, pathname));
      if (file !== base && !file.startsWith(base + sep)) {
        response.writeHead(403).end();
        return;
      }
      let info = await stat(file).catch(() => null);
      if (info?.isDirectory()) {
        file = join(file, "index.html");
        info = await stat(file).catch(() => null);
      }
      if (!info?.isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "content-length": info.size,
        "cache-control": "no-store"
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((resolveClose) => {
        server.closeAllConnections();
        server.close(() => resolveClose());
      })
  };
};
