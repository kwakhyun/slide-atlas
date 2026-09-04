import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const lock = readFileSync(resolve(root, "package-lock.json"));
const baseline = JSON.parse(
  readFileSync(resolve(root, "docs/dependency-audit.json"), "utf8"),
);
const lockHash = createHash("sha256").update(lock).digest("hex");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const audit = spawnSync(
  npm,
  [
    "audit",
    "--json",
    "--audit-level=high",
    "--fetch-timeout=15000",
    "--fetch-retries=0",
  ],
  { encoding: "utf8", timeout: 30_000 },
);

let report;
try {
  report = JSON.parse(audit.stdout.trim());
} catch {
  report = undefined;
}

const vulnerabilities = report?.metadata?.vulnerabilities;
if (audit.status === 0 && vulnerabilities) {
  console.log(JSON.stringify({ source: "npm-registry", vulnerabilities }));
  process.exit(0);
}

if ((vulnerabilities?.high ?? 0) > 0 || (vulnerabilities?.critical ?? 0) > 0) {
  console.error(audit.stdout);
  process.exit(1);
}

const failure = `${audit.error?.message ?? ""}\n${audit.stderr}`;
const registryUnavailable =
  /audit endpoint returned an error|network timeout|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(
    failure,
  );
const baselineIsSafe =
  baseline.packageLockSha256 === lockHash &&
  baseline.vulnerabilities?.high === 0 &&
  baseline.vulnerabilities?.critical === 0;

if (registryUnavailable && baselineIsSafe) {
  console.warn(
    `::warning title=npm audit registry unavailable::The current package-lock.json matches the zero-high/critical result recorded on ${baseline.checkedAt}.`,
  );
  console.log(
    JSON.stringify({
      source: "recorded-result",
      checkedAt: baseline.checkedAt,
      packageLockSha256: lockHash,
      sourceCiRun: baseline.sourceCiRun,
    }),
  );
  process.exit(0);
}

if (registryUnavailable) {
  console.error(
    "npm audit is unavailable and package-lock.json does not match the last successful audit.",
  );
} else {
  console.error(audit.stdout || failure || "npm audit failed without output.");
}
process.exit(1);
