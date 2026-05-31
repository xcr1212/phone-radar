import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fetchScript = resolve(rootDir, "scripts", "fetch-news.mjs");
const host = "127.0.0.1";
const port = 8765;
let updatePromise = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);

    if (url.pathname === "/api/update") {
      if (request.method !== "POST") {
        sendJson(response, 405, { ok: false, error: "method not allowed" });
        return;
      }

      const result = await runUpdate();
      sendJson(response, result.ok ? 200 : 500, result);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendText(response, 500, "Internal server error");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Phone Radar running at http://${host}:${port}/`);
});

async function serveStatic(pathname, response) {
  const requestPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(rootDir, safePath));

  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function runUpdate() {
  if (!updatePromise) {
    updatePromise = new Promise((resolveUpdate) => {
      const child = spawn(process.execPath, [fetchScript], {
        cwd: rootDir,
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => {
        updatePromise = null;
        resolveUpdate({
          ok: code === 0,
          code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          updatedAt: new Date().toISOString()
        });
      });
      child.on("error", (error) => {
        updatePromise = null;
        resolveUpdate({
          ok: false,
          code: -1,
          stdout: "",
          stderr: error.message,
          updatedAt: new Date().toISOString()
        });
      });
    });
  }

  return updatePromise;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(text);
}
