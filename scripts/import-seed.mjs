#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_ROOT,
  EPOCH,
  TARGET,
  addCounters,
  validateRecords,
} from "./update-data.mjs";

const SEED_SOURCE = "https://wordfinder.yourdictionary.com/wordle/answers/";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../public/data/wordle.json");
const monthNumbers = new Map([
  ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
  ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
  ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"],
]);

function plainText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSeedArchive(html) {
  const markers = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>|<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const records = [];
  let currentYear = null;
  let currentMonth = null;

  for (const marker of markers) {
    if (marker[1] !== undefined) {
      const heading = plainText(marker[1]);
      const headingMatch = heading.match(/^All ([A-Z][a-z]+) (20\d{2}) Wordle Answers$/);
      if (!headingMatch) continue;
      currentYear = headingMatch[2];
      currentMonth = monthNumbers.get(headingMatch[1].slice(0, 3));
      continue;
    }

    if (!currentYear || !currentMonth) continue;
    const row = plainText(marker[2]);
    const rowMatch = row.match(/^(?:Today )?([A-Z][a-z]{2})\.? (\d{1,2}) (\d+) (?:Reveal )?([A-Z]{5})$/);
    if (!rowMatch) continue;

    const [, monthName, day, puzzle, answer] = rowMatch;
    const rowMonth = monthNumbers.get(monthName);
    if (rowMonth !== currentMonth) {
      throw new Error(`Month mismatch in seed row: ${row}`);
    }

    records.push({
      puzzle: Number(puzzle),
      date: `${currentYear}-${currentMonth}-${day.padStart(2, "0")}`,
      answer,
    });
  }

  return records.sort((a, b) => a.puzzle - b.puzzle);
}

async function main() {
  const response = await fetch(SEED_SOURCE, {
    headers: { "User-Agent": "dayssincecuntswasthewordleanswer.com/1.0" },
  });
  if (!response.ok) throw new Error(`Seed source returned ${response.status}.`);

  const answers = addCounters(parseSeedArchive(await response.text()));
  validateRecords(answers);

  if (answers[0].date !== EPOCH || answers[0].answer !== "CIGAR") {
    throw new Error("Seed archive did not begin with #0 CIGAR on the expected date.");
  }

  const latest = answers.at(-1);
  const payload = {
    target: TARGET,
    epoch: EPOCH,
    source: `${API_ROOT}/{YYYY-MM-DD}.json`,
    seedSource: SEED_SOURCE,
    updatedAt: new Date().toISOString(),
    latest,
    answers,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
  console.log(`Imported ${answers.length} answers through #${latest.puzzle} ${latest.answer}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
