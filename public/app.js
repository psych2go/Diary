// Keep the current tab usable even when browser storage is unavailable.
const memoryStorage = new Map();
let storageUnavailable = false;
const localStorage = {
  getItem(key) {
    if (storageUnavailable && memoryStorage.has(key)) return memoryStorage.get(key);
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      storageUnavailable = true;
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
    try {
      globalThis.localStorage.setItem(key, value);
    } catch {
      storageUnavailable = true;
    }
  },
  keys() {
    const keys = new Set(memoryStorage.keys());
    try {
      const storage = globalThis.localStorage;
      for (let index = 0; index < storage.length; index += 1) {
        keys.add(storage.key(index));
      }
    } catch {
      storageUnavailable = true;
    }
    return [...keys].filter((key) => typeof key === "string" && this.getItem(key) !== null);
  },
  removeItem(key) {
    memoryStorage.set(key, null);
    try {
      globalThis.localStorage.removeItem(key);
      return true;
    } catch {
      storageUnavailable = true;
      return false;
    }
  }
};
const draftStatus = () => storageUnavailable
  ? "草稿仅保留在当前页面，关闭页面可能丢失；仍可提交保存"
  : "草稿已保留";
const PENDING_SAVE_KEY = "diary-pending-save";

// An older cached HTML shell may briefly run the refreshed script during a PWA update.
const draftSelect = document.querySelector("#draft-select") || document.createElement("select");
const refreshDrafts = document.querySelector("#refresh-drafts") || document.createElement("button");
const restoreDraft = document.querySelector("#restore-draft") || document.createElement("button");
const clearDrafts = document.querySelector("#clear-drafts") || document.createElement("button");
const draftMessage = document.querySelector("#draft-message") || document.createElement("p");
let activeDraftKey = null;
let loginPending = false;

const loginView = document.querySelector("#login-view");
const diaryView = document.querySelector("#diary-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const passwordInput = document.querySelector("#password");
const entryForm = document.querySelector("#entry-form");
const entryInput = document.querySelector("#entry");
const saveButton = document.querySelector("#save-button");
const saveState = document.querySelector("#save-state");
const displayDate = document.querySelector("#display-date");
const weekday = document.querySelector("#weekday");
const historyButton = document.querySelector("#history-button");
const historyDialog = document.querySelector("#history-dialog");
const closeHistory = document.querySelector("#close-history");
const dateList = document.querySelector("#date-list");
const entryReader = document.querySelector("#entry-reader");
const logoutButton = document.querySelector("#logout-button");
const entriesViewButton = document.querySelector("#entries-view-button");
const statsViewButton = document.querySelector("#stats-view-button");
const entriesPanel = document.querySelector("#entries-panel");
const statsPanel = document.querySelector("#stats-panel");
const monthDays = document.querySelector("#month-days");
const currentStreak = document.querySelector("#current-streak");
const longestStreak = document.querySelector("#longest-streak");
const calendarMonth = document.querySelector("#calendar-month");
const calendarGrid = document.querySelector("#calendar-grid");
const previousMonth = document.querySelector("#previous-month");
const nextMonth = document.querySelector("#next-month");

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric"
});
const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  weekday: "long"
});
const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric"
});
const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "UTC",
  year: "numeric",
  month: "long"
});

let stats = null;
let visibleMonth = null;
let isRecording = false;
let isSaving = false;
let saveOperation = 0;
let diaryInteractive = false;
let sessionCheckPromise = null;
let logoutRequestPromise = null;
let authGeneration = 0;
let sessionRetryTimer = null;
let sessionRetryAttempt = 0;
let historyGeneration = 0;

const AUTH_FLAG_KEY = "diary-authenticated";
const LOGOUT_PENDING_KEY = "diary-logout-pending";
const SESSION_RETRY_DELAYS = [2000, 5000, 15_000, 30_000];
const SESSION_TIMEOUT_MS = 10_000;

function localDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  };
}

function draftKey() {
  return activeDraftKey ||= `diary-draft:${localDateParts().date}`;
}

async function api(path, options = {}) {
  const { timeoutMs = SESSION_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      signal: controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers
      }
    });

    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      if (controller?.signal.aborted) {
        throw error;
      }
      // Preserve the HTTP status when an intermediary returns a non-JSON error page.
    }

    if (!response.ok) {
      const error = new Error(data.error || "请求失败");
      error.status = response.status;
      if (
        response.status === 401 &&
        path !== "/api/login" &&
        path !== "/api/session"
      ) {
        lockDiary();
      }
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError" || controller?.signal.aborted) {
      throw new Error("请求超时，请重试");
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function updateDiaryHeader() {
  const now = new Date();
  displayDate.textContent = dateFormatter.format(now);
  weekday.textContent = `${fullDateFormatter.format(now)} · ${weekdayFormatter.format(now)}`;
}

function setDiaryInteractive(interactive) {
  diaryInteractive = interactive;
  entryInput.disabled = !interactive;
  saveButton.disabled = !interactive;
  historyButton.disabled = !interactive;
  refreshDrafts.disabled = !interactive;
  restoreDraft.disabled = !interactive;
  clearDrafts.disabled = !interactive;
  diaryView.setAttribute("aria-busy", String(!interactive));
}

function clearPrivateViews() {
  historyGeneration += 1;
  if (historyDialog.open) {
    historyDialog.close();
  }
  dateList.replaceChildren();
  entryReader.replaceChildren();
  calendarGrid.replaceChildren();
  draftSelect.replaceChildren();
  draftMessage.textContent = "";
  stats = null;
  visibleMonth = null;
  monthDays.textContent = "0";
  currentStreak.textContent = "0";
  longestStreak.textContent = "0";
}

function clearSessionRetry() {
  if (sessionRetryTimer) {
    clearTimeout(sessionRetryTimer);
    sessionRetryTimer = null;
  }
  sessionRetryAttempt = 0;
}

function scheduleSessionRetry() {
  if (
    sessionRetryTimer ||
    localStorage.getItem(LOGOUT_PENDING_KEY) === "1"
  ) {
    return;
  }
  const delay = SESSION_RETRY_DELAYS[
    Math.min(sessionRetryAttempt, SESSION_RETRY_DELAYS.length - 1)
  ];
  sessionRetryAttempt += 1;
  sessionRetryTimer = setTimeout(() => {
    sessionRetryTimer = null;
    validateSession();
  }, delay);
}

function showLogin() {
  clearPrivateViews();
  diaryView.hidden = true;
  loginView.hidden = false;
  entryInput.value = "";
  saveState.textContent = "";
  setRecordingState(false);
  setDiaryInteractive(false);
  passwordInput.focus();
}

function lockDiary({ removeDraft = false } = {}) {
  authGeneration += 1;
  saveOperation += 1;
  isSaving = false;
  saveButton.classList.remove("is-saving");
  clearSessionRetry();
  localStorage.removeItem(AUTH_FLAG_KEY);
  if (removeDraft) {
    localStorage.removeItem(draftKey());
    localStorage.removeItem(PENDING_SAVE_KEY);
  }
  showLogin();
}

function showDiaryShell() {
  loginView.hidden = true;
  diaryView.hidden = false;
  updateDiaryHeader();
  entryInput.value = "";
  setRecordingState(false);
  setDiaryInteractive(false);
  saveState.textContent = "正在验证会话…";
}

function showDiary(focus = false) {
  loginView.hidden = true;
  diaryView.hidden = false;
  updateDiaryHeader();
  activeDraftKey = `diary-draft:${localDateParts().date}`;
  entryInput.value = localStorage.getItem(draftKey()) || "";
  listDrafts();
  setRecordingState(Boolean(entryInput.value.trim()));
  setDiaryInteractive(true);
  saveState.textContent = entryInput.value.trim() ? draftStatus() : "";
  if (focus) {
    entryInput.focus();
  }
}

function listDrafts() {
  draftSelect.replaceChildren();
  const keys = localStorage.keys()
    .filter((key) => /^diary-draft:\d{4}-\d{2}-\d{2}$/.test(key) && localStorage.getItem(key)?.trim())
    .sort().reverse();
  for (const key of keys) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key.slice("diary-draft:".length);
    draftSelect.append(option);
  }
  draftMessage.textContent = storageUnavailable
    ? "无法完整读取本机草稿，请勿关闭页面。"
    : `本机有 ${keys.length} 份草稿；草稿为明文，恢复后需点击保存才会写入日记。`;
}

refreshDrafts.addEventListener("click", () => {
  if (diaryInteractive && !isSaving) listDrafts();
});
restoreDraft.addEventListener("click", () => {
  if (!diaryInteractive || isSaving) return;
  const key = draftSelect.value;
  if (!/^diary-draft:\d{4}-\d{2}-\d{2}$/.test(key)) return;
  const text = localStorage.getItem(key);
  if (!text) return;
  if (entryInput.value && key !== draftKey()) {
    localStorage.setItem(draftKey(), entryInput.value);
    if (storageUnavailable) {
      draftMessage.textContent = "当前草稿无法可靠保存，请先提交或复制正文，再恢复旧草稿。";
      return;
    }
  }
  activeDraftKey = key;
  entryInput.value = text;
  setRecordingState(Boolean(text.trim()));
  saveState.textContent = `已恢复 ${key.slice("diary-draft:".length)} 的草稿；将按服务器保存时间记录`;
  entryInput.focus();
});
clearDrafts.addEventListener("click", () => {
  if (!diaryInteractive || isSaving) return;
  if (!window.confirm("清除全部本机草稿和待确认保存信息？不会删除服务器日记。此操作不可撤销。")) return;
  let cleared = true;
  for (const key of localStorage.keys()) {
    if (key.startsWith("diary-draft:") || key === PENDING_SAVE_KEY) {
      if (!localStorage.removeItem(key)) cleared = false;
    }
  }
  entryInput.value = "";
  activeDraftKey = null;
  setRecordingState(false);
  listDrafts();
  saveState.textContent = "";
  draftMessage.textContent = cleared && !storageUnavailable
    ? "已清除全部本机草稿，服务器日记不受影响。"
    : "已清除当前页面草稿，但无法确认浏览器存储已清除；请在浏览器设置中清除此站点数据。";
});

function setRecordingState(recording) {
  isRecording = recording;
  saveButton.classList.toggle("is-recording", recording);
  saveButton.setAttribute("aria-pressed", String(recording));
  saveButton.setAttribute("aria-label", recording ? "记下这段日记" : "开始记录");
  saveButton.title = recording ? "记下" : "开始记录";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginPending) return;
  loginPending = true;
  loginError.textContent = "";
  const generation = ++authGeneration;

  try {
    if (localStorage.getItem(LOGOUT_PENDING_KEY) === "1") {
      if (!await retryPendingLogout()) throw new Error("退出尚未完成，请联网后重试");
    }
    if (generation !== authGeneration) return;
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    if (generation !== authGeneration) return;
    passwordInput.value = "";
    authGeneration += 1;
    clearSessionRetry();
    localStorage.removeItem(LOGOUT_PENDING_KEY);
    localStorage.setItem(AUTH_FLAG_KEY, "1");
    showDiary(true);
  } catch (error) {
    if (generation === authGeneration) {
      loginError.textContent = error.message;
      passwordInput.select();
    }
  } finally {
    loginPending = false;
  }
});

entryInput.addEventListener("input", () => {
  const value = entryInput.value;
  localStorage.setItem(draftKey(), value);
  if (value.trim()) {
    setRecordingState(true);
    saveState.textContent = draftStatus();
  } else if (!isSaving) {
    saveState.textContent = isRecording ? "正在记录" : "";
  }
});

entryInput.addEventListener("focus", () => {
  if (!isRecording) {
    setRecordingState(true);
    saveState.textContent = "正在记录";
  }
});

async function saveEntry() {
  if (!diaryInteractive || isSaving) {
    return;
  }

  const submittedValue = entryInput.value;
  const text = submittedValue.trim();
  if (!text) {
    saveState.textContent = "没有内容";
    entryInput.blur();
    setRecordingState(false);
    return;
  }

  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_SAVE_KEY));
  } catch {
    // Ignore corrupt browser metadata, never the user's draft.
  }
  if (!pending || pending.text !== text || typeof pending.requestId !== "string") {
    pending = { text, requestId: crypto.randomUUID() };
  }
  localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(pending));
  const generation = authGeneration;
  const operation = ++saveOperation;
  const submittedDraftKey = draftKey();
  isSaving = true;
  entryInput.disabled = true;
  saveButton.disabled = true;
  saveButton.classList.add("is-saving");
  saveState.textContent = "正在记下…";
  try {
    const saved = await api("/api/entries", {
      method: "POST",
      body: JSON.stringify(pending),
      timeoutMs: 20_000
    });
    if (
      generation !== authGeneration ||
      operation !== saveOperation
    ) {
      return;
    }
    localStorage.removeItem(PENDING_SAVE_KEY);
    const draftUnchanged =
      entryInput.value === submittedValue &&
      localStorage.getItem(submittedDraftKey) === submittedValue;
    if (draftUnchanged) {
      entryInput.value = "";
      localStorage.removeItem(submittedDraftKey);
      activeDraftKey = null;
      listDrafts();
      setRecordingState(false);
    }
    saveState.textContent = draftUnchanged
      ? `已记下 · ${saved.time}`
      : `已记下 · ${saved.time}，新草稿已保留`;
    navigator.vibrate?.(25);
    entryInput.blur();
  } catch (error) {
    if (operation === saveOperation && error.status !== 401) {
      saveState.textContent = `${error.message}；保存结果未确认，草稿仍保留，重试不会重复记录`;
    }
  } finally {
    if (operation === saveOperation) {
      isSaving = false;
      entryInput.disabled = !diaryInteractive;
      saveButton.disabled = !diaryInteractive;
      saveButton.classList.remove("is-saving");
    }
  }
}

entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isRecording) {
    await saveEntry();
  }
});

saveButton.addEventListener("click", async () => {
  if (isSaving) {
    return;
  }

  if (!isRecording) {
    setRecordingState(true);
    saveState.textContent = "正在记录";
    entryInput.focus();
    return;
  }

  await saveEntry();
});

async function showEntry(date, button, generation = authGeneration) {
  const requestGeneration = ++historyGeneration;
  for (const item of dateList.querySelectorAll(".date-button")) {
    item.setAttribute("aria-current", String(item === button));
  }
  entryReader.innerHTML = '<p class="empty-history">正在读取…</p>';

  try {
    const entry = await api(`/api/entries/${encodeURIComponent(date)}`);
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      !historyDialog.open
    ) {
      return;
    }
    const content = document.createElement("pre");
    content.className = "reader-content";
    content.textContent = entry.content;
    entryReader.replaceChildren(content);
  } catch (error) {
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      error.status === 401
    ) {
      return;
    }
    entryReader.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-history";
    message.textContent = error.message;
    entryReader.append(message);
  }
}

async function openHistory() {
  const generation = authGeneration;
  const requestGeneration = ++historyGeneration;
  historyDialog.showModal();
  switchHistoryView("entries");
  dateList.innerHTML = "";
  entryReader.innerHTML = '<p class="empty-history">正在读取…</p>';

  try {
    const { dates } = await api("/api/entries");
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      !historyDialog.open
    ) {
      return;
    }
    if (!dates.length) {
      entryReader.innerHTML = '<p class="empty-history">还没有日记</p>';
      return;
    }

    for (const date of dates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-button";
      button.textContent = date;
      button.addEventListener("click", () => showEntry(date, button, generation));
      dateList.append(button);
    }

    const firstButton = dateList.querySelector(".date-button");
    showEntry(dates[0], firstButton, generation);
  } catch (error) {
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      error.status === 401
    ) {
      return;
    }
    entryReader.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-history";
    message.textContent = error.message;
    entryReader.append(message);
  }
}

function switchHistoryView(view) {
  const showEntries = view === "entries";
  entriesViewButton.setAttribute("aria-pressed", String(showEntries));
  statsViewButton.setAttribute("aria-pressed", String(!showEntries));
  entriesPanel.hidden = !showEntries;
  statsPanel.hidden = showEntries;
}

function renderCalendar() {
  if (!stats || !visibleMonth) {
    return;
  }

  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const recorded = new Set(stats.dates);
  const today = localDateParts().date;
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  calendarMonth.textContent = monthFormatter.format(visibleMonth);
  calendarGrid.replaceChildren();

  for (let index = 0; index < firstWeekday; index += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-day is-empty";
    empty.textContent = "0";
    calendarGrid.append(empty);
  }

  let recordedThisMonth = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("span");
    cell.className = "calendar-day";
    cell.textContent = String(day);
    cell.setAttribute("aria-label", date);

    if (recorded.has(date)) {
      cell.classList.add("is-recorded");
      recordedThisMonth += 1;
    }
    if (date === today) {
      cell.classList.add("is-today");
    }
    calendarGrid.append(cell);
  }

  monthDays.textContent = String(recordedThisMonth);
}

async function openStats() {
  const generation = authGeneration;
  const requestGeneration = ++historyGeneration;
  switchHistoryView("stats");

  try {
    const nextStats = await api("/api/stats");
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      !historyDialog.open
    ) {
      return;
    }
    stats = nextStats;
    const [year, month] = localDateParts().date.split("-").map(Number);
    visibleMonth ||= new Date(Date.UTC(year, month - 1, 1));
    currentStreak.textContent = String(stats.currentStreak);
    longestStreak.textContent = String(stats.longestStreak);
    renderCalendar();
  } catch (error) {
    if (
      generation !== authGeneration ||
      requestGeneration !== historyGeneration ||
      error.status === 401
    ) {
      return;
    }
    monthDays.textContent = "—";
    currentStreak.textContent = "—";
    longestStreak.textContent = "—";
  }
}

function closeHistoryDialog() {
  historyGeneration += 1;
  if (historyDialog.open) {
    historyDialog.close();
  }
}

historyButton.addEventListener("click", openHistory);
closeHistory.addEventListener("click", closeHistoryDialog);
entriesViewButton.addEventListener("click", () => {
  historyGeneration += 1;
  switchHistoryView("entries");
});
statsViewButton.addEventListener("click", openStats);
previousMonth.addEventListener("click", () => {
  if (!visibleMonth) {
    return;
  }
  visibleMonth = new Date(
    Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() - 1, 1)
  );
  renderCalendar();
});
nextMonth.addEventListener("click", () => {
  if (!visibleMonth) {
    return;
  }
  visibleMonth = new Date(
    Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1)
  );
  renderCalendar();
});

historyDialog.addEventListener("close", () => {
  historyGeneration += 1;
});

historyDialog.addEventListener("click", (event) => {
  if (event.target === historyDialog) {
    closeHistoryDialog();
  }
});

function clearLocalDiarySession() {
  lockDiary({ removeDraft: true });
}

async function retryPendingLogout() {
  if (localStorage.getItem(LOGOUT_PENDING_KEY) !== "1") {
    return true;
  }
  if (logoutRequestPromise) {
    return logoutRequestPromise;
  }

  logoutRequestPromise = api("/api/logout", {
    method: "POST",
    timeoutMs: SESSION_TIMEOUT_MS
  })
    .then(() => {
      localStorage.removeItem(LOGOUT_PENDING_KEY);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      logoutRequestPromise = null;
    });
  return logoutRequestPromise;
}

async function validateSession({ focus = false } = {}) {
  if (localStorage.getItem(LOGOUT_PENDING_KEY) === "1") {
    return;
  }
  if (sessionCheckPromise) {
    return sessionCheckPromise;
  }

  const generation = authGeneration;
  sessionCheckPromise = (async () => {
    try {
      const session = await api("/api/session", {
        timeoutMs: SESSION_TIMEOUT_MS
      });
      if (
        generation !== authGeneration ||
        localStorage.getItem(LOGOUT_PENDING_KEY) === "1"
      ) {
        return;
      }
      if (session.authenticated) {
        clearSessionRetry();
        localStorage.setItem(AUTH_FLAG_KEY, "1");
        showDiary(focus);
      } else {
        lockDiary();
      }
    } catch {
      if (generation !== authGeneration) {
        return;
      }
      if (localStorage.getItem(AUTH_FLAG_KEY) === "1") {
        if (diaryView.hidden) {
          showDiaryShell();
        }
        saveState.textContent = "等待网络验证…";
        scheduleSessionRetry();
      } else {
        showLogin();
      }
    }
  })().finally(() => {
    sessionCheckPromise = null;
  });

  return sessionCheckPromise;
}

logoutButton.addEventListener("click", async () => {
  localStorage.setItem(LOGOUT_PENDING_KEY, "1");
  clearLocalDiarySession();
  loginError.textContent = "";

  if (!(await retryPendingLogout())) {
    loginError.textContent = "已在本机退出，联网后将完成会话清理";
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

if (localStorage.getItem(LOGOUT_PENDING_KEY) === "1") {
  showLogin();
  await retryPendingLogout();
} else {
  if (localStorage.getItem(AUTH_FLAG_KEY) === "1") {
    showDiaryShell();
  } else {
    showLogin();
  }
  await validateSession({ focus: true });
}

window.addEventListener("online", () => {
  clearSessionRetry();
  if (localStorage.getItem(LOGOUT_PENDING_KEY) === "1") {
    retryPendingLogout();
  } else {
    validateSession();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    return;
  }
  clearSessionRetry();
  if (localStorage.getItem(LOGOUT_PENDING_KEY) === "1") {
    retryPendingLogout();
  } else {
    validateSession();
  }
});
