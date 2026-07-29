import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const host = "127.0.0.1";
const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const requestedPort = Number.parseInt(portArgument?.slice("--port=".length) || "5177", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
  ? requestedPort
  : 5177;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"]
]);

function noCacheHeaders(type) {
  return {
    "Content-Type": type,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
  };
}

function requestedPath(url = "/") {
  const parsed = new URL(url, `http://${host}:${port}`);
  const rawPath = decodeURIComponent(parsed.pathname);
  const pathname = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = normalize(pathname).replace(/^([/\\])+/, "");
  const fullPath = resolve(join(root, safePath));
  const rel = relative(root, fullPath);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) return null;
  return fullPath;
}

const server = createServer(async (req, res) => {
  const filePath = requestedPath(req.url);
  if (!filePath) {
    res.writeHead(403, noCacheHeaders("text/plain; charset=utf-8"));
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const type = contentTypes.get(extname(filePath).toLowerCase()) || "application/octet-stream";
    res.writeHead(200, noCacheHeaders(type));
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, noCacheHeaders("text/plain; charset=utf-8"));
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Card duel dev server running at http://${host}:${port}/`);
  console.log("Cache disabled for local development.");
});
