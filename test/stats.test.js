import assert from "node:assert/strict";
import test from "node:test";
import { calculateStats, shanghaiTimestamp } from "../src/stats.js";

test("uses Asia/Shanghai for diary timestamps", () => {
  assert.deepEqual(shanghaiTimestamp(new Date("2026-08-08T16:05:00Z")), {
    date: "2026-08-09",
    time: "00:05"
  });
});

test("calculates current and longest streaks from recorded days", () => {
  assert.deepEqual(
    calculateStats(
      [
        "2026-07-01",
        "2026-07-02",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-08"
      ],
      "2026-08-09"
    ),
    {
      currentStreak: 4,
      longestStreak: 4,
      recordedDays: 6,
      dates: [
        "2026-07-01",
        "2026-07-02",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-08"
      ]
    }
  );
});

test("starts today's streak after the first entry and ignores future dates", () => {
  const stats = calculateStats(
    ["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10"],
    "2026-08-09"
  );

  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.recordedDays, 3);
});
