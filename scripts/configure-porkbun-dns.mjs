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
    const name = String(record.name || "").replace(`.${DOMAIN}`, "");
    const type = String(record.type || "").toUpperCase();
    return (
      (name === "" && ["A", "AAAA", "ALIAS", "CNAME"].includes(type))
      || (name === "www" && ["A", "AAAA", "ALIAS", "CNAME"].includes(type))
    );
  });
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
    apikey: env.PORKBUN_API,
    secretapikey: env.PORKBUN_SECRET_API,
  };

  if (!credentials.apikey?.startsWith("pk1_")) {
    throw new Error("PORKBUN_API is missing or is not a pk1_ API key.");
  }
  if (!credentials.secretapikey?.startsWith("sk1_")) {
    throw new Error("PORKBUN_SECRET_API is missing or is not an sk1_ secret API key.");
  }

  await request("/ping", credentials);
  const current = await request(`/dns/retrieve/${DOMAIN}`, credentials);
  const conflicts = conflictingRecords(current.records || []);

  console.log(`${apply ? "Applying" : "Dry run for"} DNS cutover on ${DOMAIN}:`);
  for (const record of conflicts) {
    console.log(`- remove ${record.type} ${record.name || "@"} → ${record.content}`);
  }
  console.log(`- create A @ → ${NETLIFY_APEX_IP}`);
  console.log(`- create CNAME www → ${NETLIFY_HOST}`);

  if (!apply) {
    console.log("No changes made. Run `npm run dns:apply` to apply this exact plan.");
    return;
  }

  for (const record of conflicts) {
    await request(`/dns/delete/${DOMAIN}/${record.id}`, credentials);
  }
  await request(`/dns/create/${DOMAIN}`, credentials, {
    name: "",
    type: "A",
    content: NETLIFY_APEX_IP,
    ttl: "600",
  });
  await request(`/dns/create/${DOMAIN}`, credentials, {
    name: "www",
    type: "CNAME",
    content: NETLIFY_HOST,
    ttl: "600",
  });
  console.log("Porkbun DNS cutover complete.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
