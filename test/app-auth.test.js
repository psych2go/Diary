import assert from "node:assert/strict";
import test from "node:test";

function createElement() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    listeners,
    attributes,
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    hidden: true,
    open: false,
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    append() {},
    blur() {},
    close() {
      this.open = false;
    },
    focus() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    replaceChildren() {},
    select() {},
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    showModal() {
      this.open = true;
    }
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return value;
    }
  };
}

test("authentication races and expired sessions lock private views", async () => {
  const selectors = [
    "#login-view",
    "#diary-view",
    "#login-form",
    "#login-error",
    "#password",
    "#entry-form",
    "#entry",
    "#save-button",
    "#save-state",
    "#display-date",
    "#weekday",
    "#history-button",
    "#history-dialog",
    "#close-history",
    "#date-list",
    "#entry-reader",
    "#logout-button",
    "#entries-view-button",
    "#stats-view-button",
    "#entries-panel",
    "#stats-panel",
    "#month-days",
    "#current-streak",
    "#longest-streak",
    "#calendar-month",
    "#calendar-grid",
    "#previous-month",
    "#next-month"
  ];
  const elements = new Map(selectors.map((selector) => [selector, createElement()]));
  const storage = new Map();
  const originalGlobals = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  let resolveSession;
  let sessionRequested = false;
  let fetchImpl = (path) => {
    if (path === "/api/session") {
      sessionRequested = true;
      return new Promise((resolve) => {
        resolveSession = resolve;
      });
    }
    if (path === "/api/login") {
      return Promise.resolve(jsonResponse({ authenticated: true }));
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  const globals = {
    document: {
      visibilityState: "visible",
      addEventListener(name, handler) {
        documentListeners.set(name, handler);
      },
      createElement,
      querySelector(selector) {
        return elements.get(selector);
      }
    },
    fetch(path, options) {
      return fetchImpl(path, options);
    },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      removeItem(key) {
        storage.delete(key);
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    navigator: {
      serviceWorker: { register() {} },
      vibrate() {}
    },
    window: {
      addEventListener(name, handler) {
        windowListeners.set(name, handler);
      }
    }
  };

  for (const [name, value] of Object.entries(globals)) {
    originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true
    });
  }

  try {
    const modulePromise = import(`../public/app.js?auth-race=${Date.now()}`);
    while (!sessionRequested) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    elements.get("#password").value = "correct-password";
    await elements.get("#login-form").listeners.get("submit")({ preventDefault() {} });
    assert.equal(storage.get("diary-authenticated"), "1");
    assert.equal(elements.get("#diary-view").hidden, false);

    resolveSession(jsonResponse({ authenticated: false }));
    await modulePromise;

    assert.equal(storage.get("diary-authenticated"), "1");
    assert.equal(elements.get("#diary-view").hidden, false);
    assert.equal(elements.get("#login-view").hidden, true);

    let resolveSave;
    fetchImpl = (path) => {
      if (path === "/api/entries") {
        return new Promise((resolve) => {
          resolveSave = resolve;
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    elements.get("#entry").value = "submitted draft";
    elements.get("#entry").listeners.get("input")();
    const savePromise = elements.get("#save-button").listeners.get("click")();
    assert.equal(elements.get("#entry").disabled, true);

    elements.get("#entry").value = "newer draft";
    elements.get("#entry").listeners.get("input")();
    resolveSave(jsonResponse({ time: "12:00" }, 201));
    await savePromise;

    const draftKey = [...storage.keys()].find((key) => key.startsWith("diary-draft:"));
    assert.equal(elements.get("#entry").value, "newer draft");
    assert.equal(storage.get(draftKey), "newer draft");

    elements.get("#history-dialog").open = true;
    elements.get("#entry-reader").textContent = "private diary content";
    fetchImpl = (path) => {
      if (path === "/api/session") {
        return Promise.resolve(jsonResponse({ authenticated: false }));
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    documentListeners.get("visibilitychange")();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storage.has("diary-authenticated"), false);
    assert.equal(elements.get("#history-dialog").open, false);
    assert.equal(elements.get("#login-view").hidden, false);

    fetchImpl = (path) => {
      if (path === "/api/login") {
        return Promise.resolve(jsonResponse({ authenticated: true }));
      }
      if (path === "/api/entries") {
        return Promise.resolve(jsonResponse({ error: "请先登录" }, 401));
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    await elements.get("#login-form").listeners.get("submit")({ preventDefault() {} });
    assert.equal(storage.get("diary-authenticated"), "1");

    await elements.get("#history-button").listeners.get("click")();
    assert.equal(storage.has("diary-authenticated"), false);
    assert.equal(elements.get("#history-dialog").open, false);
    assert.equal(elements.get("#login-view").hidden, false);
  } finally {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete globalThis[name];
      }
    }
  }
});
