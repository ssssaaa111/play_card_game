import { join, normalize, relative, resolve, sep } from "node:path";

export function resolveStaticRequest(root, url = "/") {
  let rawPath;
  try { rawPath = decodeURIComponent(new URL(url, "http://127.0.0.1").pathname); }
  catch { return null; }
  // Includes encoded and Windows-style separators; private server data is never a web asset.
  if (rawPath.split(/[\\/]+/).some((part) => part.startsWith("."))) return null;
  const pathname = rawPath === "/" ? "/index.html" : rawPath;
  const safePath = normalize(pathname).replace(/^([/\\])+/, "");
  const fullPath = resolve(join(root, safePath));
  const rel = relative(root, fullPath);
  return rel.startsWith("..") || rel.includes(`..${sep}`) ? null : fullPath;
}
