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
  return `diary-draft:${localDateParts().date}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }

  return data;
}

function showLogin() {
  diaryView.hidden = true;
  loginView.hidden = false;
  passwordInput.focus();
}

function showDiary() {
  loginView.hidden = true;
  diaryView.hidden = false;
  const now = new Date();
  displayDate.textContent = dateFormatter.format(now);
  weekday.textContent = `${fullDateFormatter.format(now)} · ${weekdayFormatter.format(now)}`;
  entryInput.value = localStorage.getItem(draftKey()) || "";
  setRecordingState(Boolean(entryInput.value.trim()));
}

function setRecordingState(recording) {
  isRecording = recording;
  saveButton.classList.toggle("is-recording", recording);
  saveButton.setAttribute("aria-pressed", String(recording));
  saveButton.setAttribute("aria-label", recording ? "记下这段日记" : "开始记录");
  saveButton.title = recording ? "记下" : "开始记录";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    showDiary();
  } catch (error) {
    loginError.textContent = error.message;
    passwordInput.select();
  }
});

entryInput.addEventListener("input", () => {
  const value = entryInput.value;
  localStorage.setItem(draftKey(), value);
  if (value.trim()) {
    setRecordingState(true);
    saveState.textContent = "草稿已保留";
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
  const text = entryInput.value.trim();
  if (!text) {
    saveState.textContent = "没有内容";
    entryInput.blur();
    setRecordingState(false);
    return;
  }

  isSaving = true;
  saveButton.disabled = true;
  saveButton.classList.add("is-saving");
  saveState.textContent = "正在记下…";
  try {
    const saved = await api("/api/entries", {
      method: "POST",
      body: JSON.stringify({ text })
    });
    entryInput.value = "";
    localStorage.removeItem(draftKey());
    saveState.textContent = `已记下 · ${saved.time}`;
    navigator.vibrate?.(25);
    entryInput.blur();
    setRecordingState(false);
  } catch (error) {
    saveState.textContent = error.message;
  } finally {
    isSaving = false;
    saveButton.disabled = false;
    saveButton.classList.remove("is-saving");
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

async function showEntry(date, button) {
  for (const item of dateList.querySelectorAll(".date-button")) {
    item.setAttribute("aria-current", String(item === button));
  }
  entryReader.innerHTML = '<p class="empty-history">正在读取…</p>';

  try {
    const entry = await api(`/api/entries/${encodeURIComponent(date)}`);
    const content = document.createElement("pre");
    content.className = "reader-content";
    content.textContent = entry.content;
    entryReader.replaceChildren(content);
  } catch (error) {
    entryReader.innerHTML = "";
    const message = document.createElement("p");
    message.className = "empty-history";
    message.textContent = error.message;
    entryReader.append(message);
  }
}

async function openHistory() {
  historyDialog.showModal();
  switchHistoryView("entries");
  dateList.innerHTML = "";
  entryReader.innerHTML = '<p class="empty-history">正在读取…</p>';

  try {
    const { dates } = await api("/api/entries");
    if (!dates.length) {
      entryReader.innerHTML = '<p class="empty-history">还没有日记</p>';
      return;
    }

    for (const date of dates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-button";
      button.textContent = date;
      button.addEventListener("click", () => showEntry(date, button));
      dateList.append(button);
    }

    const firstButton = dateList.querySelector(".date-button");
    showEntry(dates[0], firstButton);
  } catch (error) {
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
  switchHistoryView("stats");

  try {
    stats = await api("/api/stats");
    const [year, month] = localDateParts().date.split("-").map(Number);
    visibleMonth ||= new Date(Date.UTC(year, month - 1, 1));
    currentStreak.textContent = String(stats.currentStreak);
    longestStreak.textContent = String(stats.longestStreak);
    renderCalendar();
  } catch (error) {
    monthDays.textContent = "—";
    currentStreak.textContent = "—";
    longestStreak.textContent = "—";
  }
}

historyButton.addEventListener("click", openHistory);
closeHistory.addEventListener("click", () => historyDialog.close());
entriesViewButton.addEventListener("click", () => switchHistoryView("entries"));
statsViewButton.addEventListener("click", openStats);
previousMonth.addEventListener("click", () => {
  visibleMonth = new Date(
    Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() - 1, 1)
  );
  renderCalendar();
});
nextMonth.addEventListener("click", () => {
  visibleMonth = new Date(
    Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1)
  );
  renderCalendar();
});

historyDialog.addEventListener("click", (event) => {
  if (event.target === historyDialog) {
    historyDialog.close();
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  localStorage.removeItem(draftKey());
  entryInput.value = "";
  saveState.textContent = "";
  setRecordingState(false);
  historyDialog.close();
  showLogin();
});

const session = await api("/api/session");
if (session.authenticated) {
  showDiary();
} else {
  showLogin();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
