import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import {
  addCounters,
  puzzleNumberForDate,
  validateRecords,
} from "../scripts/update-data.mjs";

test("maps launch and current dates to their puzzle numbers", () => {
  assert.equal(puzzleNumberForDate("2021-06-19"), 0);
  assert.equal(puzzleNumberForDate("2026-07-16"), 1853);
});

test("counter starts at zero and resets when the target appears", () => {
  const records = addCounters([
    { puzzle: 0, date: "2021-06-19", answer: "CIGAR" },
    { puzzle: 1, date: "2021-06-20", answer: "REBUT" },
    { puzzle: 2, date: "2021-06-21", answer: "CUNTS" },
    { puzzle: 3, date: "2021-06-22", answer: "SISSY" },
  ]);
  assert.deepEqual(records.map((record) => record.daysSinceTarget), [0, 1, 0, 1]);
});

test("generated archive is continuous and has known boundary answers", async () => {
  const payload = JSON.parse(await readFile("public/data/wordle.json", "utf8"));
  validateRecords(payload.answers);
  assert.deepEqual(payload.answers[0], {
    puzzle: 0,
    date: "2021-06-19",
    answer: "CIGAR",
    daysSinceTarget: 0,
  });
  assert.equal(payload.latest.puzzle, payload.answers.length - 1);
  assert.equal(payload.answers.filter(({ answer }) => answer === "CUNTS").length, 0);
});
