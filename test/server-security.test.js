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

  const cookie = login.headers.getSetCookie()[0].split(";")[0];
  for (const body of ["null", "[]", "123", '"text"', '{"password":123}', '{"password":']) {
    const invalid = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    });
    assert.equal(invalid.status, 400, body);
  }
  for (const text of [null, 123, {}, [], true]) {
    const invalid = await fetch(`${origin}/api/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ text })
    });
    assert.equal(invalid.status, 400);
  }
  assert.deepEqual(await fs.readdir(root), []);
  const invalidDate = await fetch(`${origin}/api/entries/%FF`, {
    headers: { Cookie: cookie }
  });
  assert.equal(invalidDate.status, 400);

  const payload = { text: "接口防重复测试", requestId: "671fd221-81b6-42bc-95e6-37d3a58eabaf" };
  const savedResults = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const saved = await fetch(`${origin}/api/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(payload)
    });
    assert.equal(saved.status, 201);
    savedResults.push(await saved.json());
  }
  assert.deepEqual(savedResults[0], savedResults[1]);
  const savedEntry = await fetch(`${origin}/api/entries/${savedResults[0].date}`, {
    headers: { Cookie: cookie }
  });
  const { content } = await savedEntry.json();
  assert.equal(content.split(payload.text).length - 1, 1);
  assert.doesNotMatch(content, /diary-entry:/);

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
