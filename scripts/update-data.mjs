#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EPOCH = "2021-06-19";
export const TARGET = "CUNTS";
export const API_ROOT = "https://www.nytimes.com/svc/wordle/v2";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputPath = resolve(projectRoot, "public/data/wordle.json");
const oneDay = 86_400_000;

export function dateRange(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${end}T12:00:00Z`);

  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function puzzleNumberForDate(date) {
  return Math.round(
    (new Date(`${date}T12:00:00Z`) - new Date(`${EPOCH}T12:00:00Z`)) / oneDay,
  );
}

export function addCounters(records, target = TARGET) {
  let lastTargetPuzzle = null;

  return [...records]
    .sort((a, b) => a.puzzle - b.puzzle)
    .map((record) => {
      if (record.answer === target) lastTargetPuzzle = record.puzzle;

      return {
        ...record,
        daysSinceTarget:
          lastTargetPuzzle === null
            ? record.puzzle
            : record.puzzle - lastTargetPuzzle,
      };
    });
}

export function validateRecords(records) {
  if (!records.length) throw new Error("The archive is empty.");

  for (const [index, record] of records.entries()) {
    if (record.puzzle !== index) {
      throw new Error(`Puzzle continuity failed at index ${index}.`);
    }
    if (record.date !== dateRange(EPOCH, record.date).at(-1)) {
      throw new Error(`Invalid date for puzzle #${record.puzzle}: ${record.date}`);
    }
    if (puzzleNumberForDate(record.date) !== record.puzzle) {
      throw new Error(`Date continuity failed for puzzle #${record.puzzle}.`);
    }
    if (!/^[A-Z]{5}$/.test(record.answer)) {
      throw new Error(`Invalid answer for puzzle #${record.puzzle}: ${record.answer}`);
    }
  }
}

function todayInNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchPuzzle(date, attempt = 1) {
  const response = await fetch(`${API_ROOT}/${date}.json`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "dayssincecuntswasthewordleanswer.com/1.0",
    },
  });

  if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    return fetchPuzzle(date, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`NYT API returned ${response.status} for ${date}.`);
  }

  const puzzle = await response.json();
  const expectedPuzzle = puzzleNumberForDate(date);
  const apiPuzzle = puzzle.days_since_launch ?? expectedPuzzle;
  const answer = String(puzzle.solution || "").toUpperCase();

  if (puzzle.print_date !== date || apiPuzzle !== expectedPuzzle) {
    throw new Error(`NYT API returned mismatched metadata for ${date}.`);
  }
  if (!/^[A-Z]{5}$/.test(answer)) {
    throw new Error(`NYT API returned an invalid answer for ${date}.`);
  }

  return { puzzle: expectedPuzzle, date, answer };
}

async function fetchInBatches(dates, batchSize = 8) {
  const records = [];

  for (let index = 0; index < dates.length; index += batchSize) {
    const batch = dates.slice(index, index + batchSize);
    records.push(...(await Promise.all(batch.map((date) => fetchPuzzle(date)))));
    if (dates.length > batchSize) {
      process.stdout.write(`\rFetched ${Math.min(index + batch.length, dates.length)}/${dates.length}`);
    }
  }

  if (dates.length > batchSize) process.stdout.write("\n");
  return records;
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, path);
}

export async function updateArchive({ endDate = todayInNewYork() } = {}) {
  const existing = await readExisting();
  if (!existing?.answers?.length) {
    throw new Error("No seed archive found. Run `npm run import-seed` once first.");
  }
  const existingRecords = existing?.answers || [];
  const firstMissingDate = existingRecords.length
    ? dateRange(EPOCH, endDate)[existingRecords.length]
    : EPOCH;
  const dates = firstMissingDate
      ? dateRange(firstMissingDate, endDate)
      : [];

  // Always recheck today's answer so a transient early placeholder cannot persist.
  if (!dates.includes(endDate)) dates.push(endDate);

  const freshRecords = await fetchInBatches(dates);
  const byDate = new Map(existingRecords.map((record) => [record.date, record]));
  for (const record of freshRecords) byDate.set(record.date, record);

  const records = addCounters([...byDate.values()]);
  validateRecords(records);

  const latest = records.at(-1);
  const payload = {
    target: TARGET,
    epoch: EPOCH,
    source: API_ROOT + "/{YYYY-MM-DD}.json",
    seedSource: existing.seedSource,
    updatedAt: new Date().toISOString(),
    latest,
    answers: records,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const comparableExisting = existing
    ? JSON.stringify({ latest: existing.latest, answers: existing.answers })
    : null;
  const comparableNext = JSON.stringify({ latest: payload.latest, answers: payload.answers });

  if (comparableExisting === comparableNext) {
    console.log(`No change: puzzle #${latest.puzzle} (${latest.answer}) is already current.`);
    return { changed: false, payload: existing };
  }

  await writeAtomic(outputPath, serialized);
  console.log(`Updated through puzzle #${latest.puzzle}: ${latest.answer} on ${latest.date}.`);
  return { changed: true, payload };
}

async function main() {
  await updateArchive();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
