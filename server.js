import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearSessionCookie,
  clearLegacySessionCookie,
  createSession,
  isPasswordHash,
  passwordMatches,
  readCookie,
  sessionCookie,
  verifySession
} from "./src/auth.js";
import { appendEntry, listEntries, readEntry } from "./src/diary-store.js";
import { LoginLimiter, loginClientKey } from "./src/login-limiter.js";
import { calculateStats, shanghaiTimestamp } from "./src/stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const diaryRoot = path.resolve(process.env.DIARY_DATA_DIR || __dirname);
const port = Number(process.env.PORT || 3000);
const passwordCredential =
  process.env.DIARY_PASSWORD_HASH || process.env.DIARY_PASSWORD;
const production = process.env.NODE_ENV === "production";
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
const sessionSecret =
  process.env.DIARY_SESSION_SECRET || (production ? "" : "local-development-session-secret");
const secureCookie = process.env.DIARY_SECURE_COOKIE !== "false" && production;
const trustProxy = process.env.DIARY_TRUST_PROXY === "true";

if (!passwordCredential) {
  throw new Error("DIARY_PASSWORD_HASH is required");
}

if (production && !isPasswordHash(process.env.DIARY_PASSWORD_HASH)) {
  throw new Error("DIARY_PASSWORD_HASH must be a valid scrypt hash in production");
}

if (!sessionSecret || (production && sessionSecret.length < 32)) {
  throw new Error("DIARY_SESSION_SECRET must contain at least 32 characters in production");
}

const sessionSigningSecret = crypto
  .createHmac("sha256", sessionSecret)
  .update(passwordCredential)
  .digest("hex");

const loginLimiter = new LoginLimiter();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; "));
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (production) {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000"
    );
  }
}

function sendJson(response, status, value) {
  if (!response.hasHeader("Cache-Control")) {
    response.setHeader("Cache-Control", "no-store");
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJson(request, maximumBytes = 512 * 1024) {
  const chunks = [];
  let length = 0;

  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) {
      throw new Error("Request body is too large");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function isAuthenticated(request) {
  const token =
    readCookie(request.headers.cookie, "__Host-diary_session") ||
    readCookie(request.headers.cookie, "diary_session");
  return verifySession(token, sessionSigningSecret);
}

function isAllowedMutation(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return true;
  }

  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function handleApi(request, response, url) {
  if (!isAllowedMutation(request)) {
    return sendJson(response, 403, { error: "拒绝跨站请求" });
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    return sendJson(response, 200, { authenticated: isAuthenticated(request) });
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const clientKey = loginClientKey(request, { trustProxy });
    if (!loginLimiter.canAttempt(clientKey)) {
      response.setHeader("Retry-After", "600");
      return sendJson(response, 429, { error: "尝试次数过多，请稍后再试" });
    }

    const body = await readJson(request, 16 * 1024);
    if (!passwordMatches(String(body.password || ""), passwordCredential)) {
      loginLimiter.recordFailure(clientKey);
      return sendJson(response, 401, { error: "密码不正确" });
    }

    loginLimiter.clear(clientKey);
    const cookies = [
      sessionCookie(createSession(sessionSigningSecret), secureCookie)
    ];
    if (secureCookie) {
      cookies.push(clearLegacySessionCookie(true));
    }
    response.setHeader("Set-Cookie", cookies);
    return sendJson(response, 200, { authenticated: true });
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    response.setHeader(
      "Set-Cookie",
      [...new Set([
        clearSessionCookie(secureCookie),
        clearLegacySessionCookie(secureCookie)
      ])]
    );
    return sendJson(response, 200, { authenticated: false });
  }

  if (!isAuthenticated(request)) {
    return sendJson(response, 401, { error: "请先登录" });
  }

  if (request.method === "GET" && url.pathname === "/api/entries") {
    const dates = await listEntries(diaryRoot);
    return sendJson(response, 200, { dates });
  }

  if (request.method === "GET" && url.pathname === "/api/stats") {
    const dates = await listEntries(diaryRoot, Number.POSITIVE_INFINITY);
    const { date: today } = shanghaiTimestamp();
    return sendJson(response, 200, calculateStats(dates, today));
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/entries/")) {
    const date = decodeURIComponent(url.pathname.slice("/api/entries/".length));
    const entry = await readEntry(diaryRoot, date);
    return sendJson(response, 200, entry);
  }

  if (request.method === "POST" && url.pathname === "/api/entries") {
    const body = await readJson(request);
    const timestamp = shanghaiTimestamp();
    const result = await appendEntry(diaryRoot, {
      ...timestamp,
      text: String(body.text || "")
    });
    return sendJson(response, 201, result);
  }

  return sendJson(response, 404, { error: "未找到" });
}

async function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicRoot, relativePath);

  if (!filePath.startsWith(`${publicRoot}${path.sep}`) && filePath !== publicRoot) {
    return false;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    const shouldRevalidate = [".css", ".html", ".js", ".webmanifest"].includes(
      path.extname(filePath)
    );
    const headers = {
      "Cache-Control": shouldRevalidate
        ? "no-cache, must-revalidate"
        : "public, max-age=3600",
      "Content-Type": contentType
    };
    if (shouldRevalidate) {
      headers["Cloudflare-CDN-Cache-Control"] = "no-store";
    }
    if (path.basename(filePath) === "sw.js") {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
    }
    response.writeHead(200, headers);
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      return false;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);

  try {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (await serveStatic(response, url.pathname)) {
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch (error) {
    const expected =
      error instanceof SyntaxError ||
      error.message.startsWith("Invalid diary") ||
      error.message === "Diary entry is empty" ||
      error.message === "Request body is too large";
    console.error(error);
    sendJson(response, expected ? 400 : 500, {
      error: expected ? "提交的内容无效" : "服务器暂时无法处理"
    });
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 100;
server.on("clientError", (_error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  }
});

server.listen(port, host, () => {
  console.log(`MyDiary is running on http://${host}:${port}`);
});
