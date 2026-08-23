import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createPasswordHash } from "../src/auth.js";

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 5000);
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("MyDiary is running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited during startup with code ${code}`));
    });
  });
}

async function rawRequest(port, request) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(request);
    });
    let response = "";
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("error", reject);
    socket.on("close", () => resolve(response));
  });
}

test("production server rejects cross-site writes and sets hardened cookies", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "my-diary-server-"));
  const port = await getFreePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DIARY_DATA_DIR: root,
      DIARY_PASSWORD_HASH: createPasswordHash("test-password"),
      DIARY_SESSION_SECRET: "a".repeat(64),
      DIARY_SECURE_COOKIE: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  context.after(async () => {
    child.kill("SIGTERM");
    await fs.rm(root, { recursive: true, force: true });
  });
  await waitForServer(child);

  const origin = `http://127.0.0.1:${port}`;
  const crossSite = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://attacker.example",
      "Sec-Fetch-Site": "cross-site"
    },
    body: JSON.stringify({ password: "test-password" })
  });
  assert.equal(crossSite.status, 403);

  const login = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": origin,
      "Sec-Fetch-Site": "same-origin"
    },
    body: JSON.stringify({ password: "test-password" })
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /__Host-diary_session=/);
  assert.match(login.headers.get("set-cookie"), /Secure/);

  const home = await fetch(origin);
  assert.equal(home.headers.get("strict-transport-security"), "max-age=31536000");
  assert.equal(home.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(home.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(home.headers.get("cache-control"), "no-cache, must-revalidate");
  assert.equal(home.headers.get("cloudflare-cdn-cache-control"), "no-store");

  const serviceWorker = await fetch(`${origin}/sw.js`);
  assert.equal(
    serviceWorker.headers.get("cache-control"),
    "no-store, no-cache, must-revalidate"
  );
  assert.equal(serviceWorker.headers.get("cloudflare-cdn-cache-control"), "no-store");

  const malformedHostResponse = await rawRequest(
    port,
    "GET / HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n"
  );
  assert.match(malformedHostResponse, /^HTTP\/1\.1 200 OK/);
  assert.equal((await fetch(origin)).status, 200);

  const oversizedLogin = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "x".repeat(20_000) })
  });
  assert.equal(oversizedLogin.status, 400);
});
