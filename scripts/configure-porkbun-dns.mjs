#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DOMAIN = "dayssincecuntswasthewordleanswer.com";
const NETLIFY_HOST = "dayssincecuntswasthewordleanswer.netlify.app";
const NETLIFY_APEX_IP = "75.2.60.5";
const API_ROOT = "https://api.porkbun.com/api/json/v3";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

export function conflictingRecords(records) {
  return records.filter((record) => {
    const fullName = String(record.name || "").replace(/\.$/, "");
    const name = fullName === DOMAIN
      ? ""
      : fullName.endsWith(`.${DOMAIN}`)
        ? fullName.slice(0, -1 * (`.${DOMAIN}`.length))
        : fullName;
    const type = String(record.type || "").toUpperCase();
    const content = String(record.content || "").replace(/\.$/, "");
    if (name === "" && type === "A" && content === NETLIFY_APEX_IP) return false;
    if (name === "www" && type === "CNAME" && content === NETLIFY_HOST) return false;
    return (
      (name === "" && ["A", "AAAA", "ALIAS", "CNAME"].includes(type))
      || (name === "www" && ["A", "AAAA", "ALIAS", "CNAME"].includes(type))
    );
  });
}

export function missingRecords(records) {
  const normalized = records.map((record) => {
    const fullName = String(record.name || "").replace(/\.$/, "");
    const name = fullName === DOMAIN
      ? ""
      : fullName.endsWith(`.${DOMAIN}`)
        ? fullName.slice(0, -1 * (`.${DOMAIN}`.length))
        : fullName;
    return {
      name,
      type: String(record.type || "").toUpperCase(),
      content: String(record.content || "").replace(/\.$/, ""),
    };
  });

  return [
    { name: "", type: "A", content: NETLIFY_APEX_IP, ttl: "600" },
    { name: "www", type: "CNAME", content: NETLIFY_HOST, ttl: "600" },
  ].filter((desired) => !normalized.some((record) =>
    record.name === desired.name
      && record.type === desired.type
      && record.content === desired.content));
}

async function request(path, credentials, body = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials, ...body }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "SUCCESS") {
    throw new Error(payload.message || `Porkbun API request failed with ${response.status}.`);
  }
  return payload;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = parseEnv(await readFile(resolve(projectRoot, ".env"), "utf8"));
  const credentials = {
    apikey: env.PORKBUN_APIKEY || env.PORKBUN_API,
    secretapikey: env.PORKBUN_SECRET || env.PORKBUN_SECRET_API,
  };

  if (!credentials.apikey?.startsWith("pk1_")) {
    throw new Error("PORKBUN_APIKEY is missing or is not a pk1_ API key.");
  }
  if (!credentials.secretapikey?.startsWith("sk1_")) {
    throw new Error("PORKBUN_SECRET is missing or is not an sk1_ secret API key.");
  }

  await request("/ping", credentials);
  const current = await request(`/dns/retrieve/${DOMAIN}`, credentials);
  const conflicts = conflictingRecords(current.records || []);
  const missing = missingRecords(current.records || []);

  console.log(`${apply ? "Applying" : "Dry run for"} DNS cutover on ${DOMAIN}:`);
  for (const record of conflicts) {
    console.log(`- remove ${record.type} ${record.name || "@"} → ${record.content}`);
  }
  for (const record of missing) {
    console.log(`- create ${record.type} ${record.name || "@"} → ${record.content}`);
  }

  if (!conflicts.length && !missing.length) {
    console.log("- no changes; DNS already matches the Netlify configuration");
  }

  if (!apply) {
    console.log("No changes made. Run `npm run dns:apply` to apply this exact plan.");
    return;
  }

  for (const record of conflicts) {
    await request(`/dns/delete/${DOMAIN}/${record.id}`, credentials);
  }
  for (const record of missing) {
    await request(`/dns/create/${DOMAIN}`, credentials, record);
  }
  console.log("Porkbun DNS cutover complete.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
