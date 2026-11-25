import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { Readable } from "node:stream";
import { handleStation } from "./lib/station.js";

const root = dirname(fileURLToPath(import.meta.url));
try { loadEnvFile(resolve(root, ".env")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".m": "text/plain", ".md": "text/plain" };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/station") {
      const webRequest = new Request("http://" + request.headers.host + request.url, {
        method: request.method, headers: request.headers,
        ...(["GET", "HEAD"].includes(request.method) ? {} : { body: Readable.toWeb(request), duplex: "half" })
      });
      const result = await handleStation(webRequest);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const path = resolve(root, name);
    const publicFiles = ["index.html", "style.css", "app.js", "core.js", "api.js", "sw.js", "setup.html", "thingspeak/parcel_email_alert.m"];
    if (!path.startsWith(root + sep) || !publicFiles.includes(name)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const data = await readFile(path);
    response.writeHead(200, {
      "Content-Type": (types[extname(path)] || "application/octet-stream") + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }).end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("File not found");
  }
});
server.on("error", error => {
  console.error(error.code === "EADDRINUSE"
    ? "Port " + port + " is already in use. Open http://localhost:" + port + " or close the earlier server."
    : error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  const url = "http://localhost:" + port;
  console.log("Parcel dashboard · " + url);
  if (process.argv.includes("--open") && process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/c", "start", "", url], { windowsHide: true, stdio: "ignore" })
      .on("error", () => console.log("Open " + url + " in your browser."));
  }
});
