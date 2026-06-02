import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fetchScript = resolve(rootDir, "scripts", "fetch-news.mjs");
const grabScript = resolve(rootDir, "scripts", "quick-grab.mjs");
const grabOutputDir = resolve(rootDir, "grabbed-specs");
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

    if (url.pathname === "/api/grab-specs") {
      if (request.method !== "POST") {
        sendJson(response, 405, { ok: false, error: "method not allowed" });
        return;
      }

      const body = await readRequestJson(request);
      const targetUrl = String(body.url || "").trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        sendJson(response, 400, { ok: false, error: "请粘贴 http/https 开头的官方参数页链接" });
        return;
      }

      const result = await runGrab(targetUrl);
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

async function runGrab(targetUrl) {
  await mkdir(grabOutputDir, { recursive: true });
  const startedAt = Date.now();

  return new Promise((resolveGrab) => {
    const child = spawn(process.execPath, [grabScript, targetUrl], {
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
    child.on("close", async (code) => {
      if (code !== 0) {
        resolveGrab({ ok: false, code, error: stderr.trim() || stdout.trim() || "抓取失败" });
        return;
      }

      try {
        const markdownFile = await newestOutputFile(".md", startedAt);
        const jsonFile = await newestOutputFile(".json", startedAt);
        const markdown = await readFile(markdownFile, "utf8");
        resolveGrab({
          ok: true,
          markdown,
          markdownFile,
          jsonFile,
          folder: grabOutputDir,
          stdout: stdout.trim()
        });
      } catch (error) {
        resolveGrab({ ok: false, code, error: error.message, stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
    child.on("error", (error) => {
      resolveGrab({ ok: false, code: -1, error: error.message });
    });
  });
}

async function newestOutputFile(extension, startedAt) {
  const files = await readdir(grabOutputDir);
  const candidates = [];
  for (const file of files) {
    if (!file.endsWith(extension)) continue;
    const filePath = resolve(grabOutputDir, file);
    const fileStat = await stat(filePath);
    if (fileStat.mtimeMs >= startedAt - 1000) {
      candidates.push({ filePath, mtimeMs: fileStat.mtimeMs });
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates[0]) throw new Error(`没有找到生成的 ${extension} 文件`);
  return candidates[0].filePath;
}

function readRequestJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk.toString();
      if (raw.length > 1024 * 1024) {
        request.destroy();
        rejectBody(new Error("request too large"));
      }
    });
    request.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        resolveBody({});
      }
    });
    request.on("error", rejectBody);
  });
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
