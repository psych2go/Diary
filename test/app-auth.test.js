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
    "#draft-select",
    "#refresh-drafts",
    "#restore-draft",
    "#clear-drafts",
    "#draft-message",
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
  let confirmClear = false;
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
      get length() { return storage.size; },
      key(index) { return [...storage.keys()][index] ?? null; },
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
      confirm() { return confirmClear; },
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

    // A lost response must keep the same ID for an unchanged retry.
    const submittedBodies = [];
    fetchImpl = (_path, options) => {
      submittedBodies.push(JSON.parse(options.body));
      if (submittedBodies.length === 1) throw new Error("Connection lost");
      return Promise.resolve(jsonResponse({ time: "12:01" }, 201));
    };
    await elements.get("#save-button").listeners.get("click")();
    assert.equal(elements.get("#entry").value, "newer draft");
    assert.match(elements.get("#save-state").textContent, /保存结果未确认/);
    await elements.get("#save-button").listeners.get("click")();
    assert.equal(submittedBodies.length, 2);
    assert.equal(submittedBodies[0].requestId, submittedBodies[1].requestId);
    assert.equal(elements.get("#entry").value, "");
    assert.equal(storage.has("diary-pending-save"), false);

    // An old stats response must neither replace nor clear the latest state.
    const statsResolvers = [];
    fetchImpl = () => new Promise((resolve) => statsResolvers.push(resolve));
    elements.get("#history-dialog").open = true;
    const oldStats = elements.get("#stats-view-button").listeners.get("click")();
    const newStats = elements.get("#stats-view-button").listeners.get("click")();
    statsResolvers[1](jsonResponse({ dates: [], currentStreak: 9, longestStreak: 10 }));
    await newStats;
    statsResolvers[0](jsonResponse({ dates: [], currentStreak: 1, longestStreak: 2 }));
    await oldStats;
    assert.equal(elements.get("#current-streak").textContent, "9");
    const displayedMonth = elements.get("#calendar-month").textContent;
    elements.get("#next-month").listeners.get("click")();
    assert.notEqual(elements.get("#calendar-month").textContent, displayedMonth);

    // Old drafts are restored only on request, without overwriting today's draft.
    const oldDraftKey = "diary-draft:2020-01-02";
    storage.set(oldDraftKey, "旧草稿");
    storage.set("unrelated-setting", "keep");
    elements.get("#entry").value = "今日未保存的草稿";
    elements.get("#entry").listeners.get("input")();
    elements.get("#refresh-drafts").listeners.get("click")();
    elements.get("#draft-select").value = oldDraftKey;
    elements.get("#restore-draft").listeners.get("click")();
    assert.equal(elements.get("#entry").value, "旧草稿");
    assert.equal(storage.get(draftKey), "今日未保存的草稿");
    elements.get("#entry").value = "修改后的旧草稿";
    elements.get("#entry").listeners.get("input")();
    assert.equal(storage.get(oldDraftKey), "修改后的旧草稿");
    elements.get("#clear-drafts").listeners.get("click")();
    assert.equal(storage.get(oldDraftKey), "修改后的旧草稿");
    confirmClear = true;
    storage.set("diary-pending-save", "{}");
    elements.get("#clear-drafts").listeners.get("click")();
    assert.equal(storage.has(oldDraftKey), false);
    assert.equal(storage.has(draftKey), false);
    assert.equal(storage.has("diary-pending-save"), false);
    assert.equal(storage.get("unrelated-setting"), "keep");
    assert.equal(storage.get("diary-authenticated"), "1");
    assert.equal(elements.get("#entry").value, "");

    fetchImpl = (_path, options) => {
      submittedBodies.push(JSON.parse(options.body));
      return Promise.resolve(jsonResponse({ time: "12:02" }, 201));
    };
    // Quota errors must not prevent editing or saving to the server.
    const originalSetItem = globals.localStorage.setItem;
    globals.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
    elements.get("#entry").value = "草稿存储不可用时仍可保存";
    elements.get("#entry").listeners.get("input")();
    assert.match(elements.get("#save-state").textContent, /仅保留在当前页面/);
    await elements.get("#save-button").listeners.get("click")();
    assert.equal(elements.get("#entry").value, "");
    assert.equal(submittedBodies.at(-1).text, "草稿存储不可用时仍可保存");
    globals.localStorage.setItem = originalSetItem;

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
