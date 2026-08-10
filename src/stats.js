const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(date) {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function fromDayNumber(dayNumber) {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

export function shanghaiTimestamp(now = new Date()) {
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

export function calculateStats(dates, today) {
  const uniqueDates = [...new Set(dates)]
    .filter((date) => date <= today)
    .sort();
  const recorded = new Set(uniqueDates);

  let longestStreak = 0;
  let runningStreak = 0;
  let previousDay = null;

  for (const date of uniqueDates) {
    const day = toDayNumber(date);
    runningStreak = previousDay !== null && day - previousDay === 1 ? runningStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDay = day;
  }

  let cursor = toDayNumber(today);
  if (!recorded.has(today)) {
    cursor -= 1;
  }

  let currentStreak = 0;
  while (recorded.has(fromDayNumber(cursor))) {
    currentStreak += 1;
    cursor -= 1;
  }

  return {
    currentStreak,
    longestStreak,
    recordedDays: uniqueDates.length,
    dates: uniqueDates
  };
}
