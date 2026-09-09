import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(
  path.resolve(import.meta.dirname, "..", "public", "sw.js"),
  "utf8"
);

function createHarness() {
  const listeners = new Map();
  const stores = new Map();
  let cacheUnavailable = false;
  let fetchImpl = async () => {
    throw new Error("Unexpected network request");
  };

  function requestKey(request) {
    return typeof request === "string" ? request : request.url;
  }

  const caches = {
    async open(name) {
      if (cacheUnavailable) {
        throw new Error("Cache Storage unavailable");
      }
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          async addAll() {},
          async match(request) {
            return entries.get(requestKey(request));
          },
          async put(request, response) {
            entries.set(requestKey(request), response);
          }
        });
      }
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    }
  };

  const self = {
    location: { origin: "https://diary.zhuying.fun" },
    clients: { async claim() {} },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    skipWaiting() {}
  };

  vm.runInNewContext(source, {
    URL,
    caches,
    fetch: (...args) => fetchImpl(...args),
    self
  });

  return {
    caches,
    listener: (name) => listeners.get(name),
    setCacheUnavailable(unavailable) {
      cacheUnavailable = unavailable;
    },
    setFetch(implementation) {
      fetchImpl = implementation;
    }
  };
}

function runFetch(handler, request) {
  let responsePromise;
  let lifetimePromise;
  handler({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    },
    waitUntil(promise) {
      lifetimePromise = Promise.resolve(promise);
    }
  });
  return { responsePromise, lifetimePromise };
}

function response(name, { ok = true, type = "basic" } = {}) {
  return {
    name,
    ok,
    type,
    clone() {
      return this;
    }
  };
}

test("service worker serves cached shell immediately and completes background refresh", async () => {
  const harness = createHarness();
  const cache = await harness.caches.open("my-diary-v11");
  const request = {
    method: "GET",
    url: "https://diary.zhuying.fun/app.js"
  };
  const cached = response("cached");
  const fresh = response("fresh");
  await cache.put(request, cached);

  let releaseNetwork;
  harness.setFetch(
    () => new Promise((resolve) => {
      releaseNetwork = () => resolve(fresh);
    })
  );

  const event = runFetch(harness.listener("fetch"), request);
  assert.equal(await event.responsePromise, cached);

  releaseNetwork();
  await event.lifetimePromise;
  assert.equal(await cache.match(request), fresh);
});

test("service worker does not replace healthy cache with an error response", async () => {
  const harness = createHarness();
  const cache = await harness.caches.open("my-diary-v11");
  const request = {
    method: "GET",
    url: "https://diary.zhuying.fun/styles.css"
  };
  const cached = response("cached");
  await cache.put(request, cached);
  harness.setFetch(async () => response("server-error", { ok: false }));

  const event = runFetch(harness.listener("fetch"), request);
  assert.equal(await event.responsePromise, cached);
  await event.lifetimePromise;
  assert.equal(await cache.match(request), cached);
});

test("service worker falls back to the network when Cache Storage fails", async () => {
  const harness = createHarness();
  const fresh = response("fresh");
  harness.setCacheUnavailable(true);
  harness.setFetch(async () => fresh);

  const event = runFetch(harness.listener("fetch"), {
    method: "GET",
    url: "https://diary.zhuying.fun/app.js"
  });
  assert.equal(await event.responsePromise, fresh);
  await event.lifetimePromise;
});

test("service worker leaves API and cross-origin requests to the network", () => {
  const harness = createHarness();
  const handler = harness.listener("fetch");

  for (const url of [
    "https://diary.zhuying.fun/api/session",
    "https://example.com/app.js"
  ]) {
    const event = runFetch(handler, { method: "GET", url });
    assert.equal(event.responsePromise, undefined);
    assert.equal(event.lifetimePromise, undefined);
  }
});
