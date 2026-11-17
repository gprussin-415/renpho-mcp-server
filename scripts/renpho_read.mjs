#!/usr/bin/env node
// Read Renpho weigh-ins since a start date and print them as JSON:
//   [{"date": "YYYY-MM-DD", "weight_lb": 161.6}, ...]   (oldest first)
//
// Usage (from the repo root, after `npm install && npm run build`):
//   node scripts/renpho_read.mjs 2026-10-01                 # JSON to stdout
//   node scripts/renpho_read.mjs 2026-10-01 --out w.json    # JSON to a file
//
// Needs RENPHO_EMAIL and RENPHO_PASSWORD in the environment. Credentials are
// never printed or written. Dates are calendar days in the TZ environment
// variable's time zone (UTC if unset), e.g. TZ=America/New_York.
//
// Exit codes (only stdout/--out ever carries data; messages go to stderr):
//   0  success (an empty list "[]" if there are no weigh-ins)
//   1  bad usage, or dist/ not built
//   2  RENPHO_EMAIL / RENPHO_PASSWORD not set
//   3  login rejected by Renpho  -> stderr: "renpho_read: LOGIN_FAILED (code=...)"
//   4  any other error (network, API, no scale linked)

import { writeFileSync } from "node:fs";

const KG_TO_LB = 2.20462262185;
const fail = (code, msg) => {
  process.stderr.write(`renpho_read: ${msg}\n`);
  process.exit(code);
};

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
const startDate = args.find((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));
if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || (outIdx >= 0 && !outPath)) {
  fail(1, "usage: node scripts/renpho_read.mjs YYYY-MM-DD [--out file.json]");
}

const { RENPHO_EMAIL: email, RENPHO_PASSWORD: password } = process.env;
if (!email || !password) fail(2, "MISSING_CREDENTIALS (set RENPHO_EMAIL and RENPHO_PASSWORD)");

let RenphoApiService;
try {
  ({ RenphoApiService } = await import("../dist/services/renpho-api.js"));
} catch {
  fail(1, "dist/ not found; run `npm install && npm run build` first");
}

const timeZone = process.env.TZ || "UTC";
const toLocalDate = (sec) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(sec * 1000));

// Fetch from one day before the start date (UTC) so time-zone offsets can't
// drop early-morning weigh-ins, then filter on the local calendar date.
const fetchFrom = Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000) - 86400;

let measurements;
try {
  const api = new RenphoApiService(email, password);
  measurements = await api.getMeasurements(undefined, fetchFrom, 1000);
} catch (err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith("Authentication failed")) {
    fail(3, `LOGIN_FAILED (${msg.replace(/^Authentication failed:\s*/, "")})`);
  }
  fail(4, `ERROR ${msg}`);
}

const rows = measurements
  .filter((m) => typeof m.weight === "number" && m.weight > 0)
  .map((m) => ({ ts: m.time_stamp, date: toLocalDate(m.time_stamp), weight_lb: Math.round(m.weight * KG_TO_LB * 10) / 10 }))
  .filter((r) => r.date >= startDate)
  .sort((a, b) => a.ts - b.ts)
  .map(({ date, weight_lb }) => ({ date, weight_lb }));

const json = JSON.stringify(rows, null, 2) + "\n";
if (outPath) writeFileSync(outPath, json);
else process.stdout.write(json);
