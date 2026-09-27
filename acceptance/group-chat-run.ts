/**
 * #191 PR1: executable contract for GC-01..05, GC-09 and GC-15.
 *
 *   npm run acceptance:group-chat        # report expected reds if no host adapter
 *   npm run acceptance:group-chat:strict # nonzero unless all real-host checks pass
 *
 * A missing adapter is a known red baseline, never a green or host test result.
 * `kind: "mist-host"` is only a type tag: before any lamp runs, the host's own report is
 * checked against facts the judge reads itself (a live process, the current HEAD commit).
 * STUBBED follows the repo's acceptance convention: declared methods turn a lamp yellow.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { groupChatChecks, runGroupChatCheck } from "./group-chat-checks.ts";
import {
  type GroupChatCheckId,
  type GroupChatHostDriver,
  type GroupChatHostRun,
  cloneGroupChatDriverBoundary,
  groupChatSyntheticFixture,
} from "./group-chat-driver.ts";

const DRIVER_SPECIFIER = "../src/group-chat-acceptance-driver.ts";
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOT = join(REPO_ROOT, "src");
const strict = process.argv.includes("--strict");

export interface GroupChatRunResult {
  readonly id: GroupChatCheckId;
  readonly title: string;
  readonly passed: boolean;
  readonly stubbed: boolean;
  readonly detail: string;
}

export function scoreGroupChatResults(results: readonly GroupChatRunResult[]): {
  readonly trueGreen: number;
  readonly stubGreen: number;
  readonly strictPass: boolean;
} {
  const trueGreen = results.filter((result) => result.passed && !result.stubbed).length;
  const stubGreen = results.filter((result) => result.passed && result.stubbed).length;
  return { trueGreen, stubGreen, strictPass: trueGreen === results.length };
}

export function missingDriverResults(): GroupChatRunResult[] {
  return groupChatChecks.map(({ id, title }) => ({
    id,
    title,
    passed: false,
    stubbed: false,
    detail: "real-host driver missing (expected PR1 red; no host behavior exercised)",
  }));
}

export interface HostProvenanceFacts {
  readonly headCommit: string;
  readonly isProcessAlive: (pid: number) => boolean;
}

/**
 * Checks the host's self-reported run against judge-read facts. Returns the reason it is not
 * acceptable as real-host evidence, or null. A synthetic fixture (made-up pid, placeholder
 * commit) fails here even if it calls itself "mist-host".
 */
export function hostProvenanceProblem(
  run: GroupChatHostRun,
  facts: HostProvenanceFacts,
): string | null {
  if (!Number.isSafeInteger(run.pid) || run.pid <= 0)
    return "host did not report a valid process id";
  if (!facts.isProcessAlive(run.pid)) return `host process ${run.pid} is not running`;
  const commit = run.commit.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/u.test(commit)) return `host source "${run.commit}" is not a commit id`;
  if (!facts.headCommit.trim().toLowerCase().startsWith(commit))
    return `host source ${run.commit} is not the checked-out HEAD ${facts.headCommit.trim()}`;
  return null;
}

function currentHeadCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "__tests__", "test", "tests"]);

/**
 * GC-04 static half: non-test source files under `root` that spell out any of `terms`.
 * Paths are reported relative to `displayRoot`. Only judge fixture/roster ids can be found
 * this way; hard-coded production names are left to the two-world differential and review.
 */
export async function findSourceLiterals(
  root: string,
  terms: readonly string[],
  displayRoot: string = root,
): Promise<string[]> {
  if (terms.length === 0 || !existsSync(root)) return [];
  const hits: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(path);
      } else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
        const text = await readFile(path, "utf8");
        if (terms.some((term) => text.includes(term))) hits.push(relative(displayRoot, path));
      }
    }
  };
  await walk(root);
  return hits.sort();
}

function driverFileExists(): boolean {
  return existsSync(fileURLToPath(new URL(DRIVER_SPECIFIER, import.meta.url)));
}

interface LoadedDriver {
  readonly driver: GroupChatHostDriver;
  readonly stubbed: ReadonlySet<string>;
}

async function loadDriver(): Promise<LoadedDriver | null> {
  if (!driverFileExists()) return null;
  const mod = await import(DRIVER_SPECIFIER);
  if (typeof mod.createGroupChatHostDriver !== "function") {
    throw new Error(
      "src/group-chat-acceptance-driver.ts exists but does not export createGroupChatHostDriver()",
    );
  }
  const driver = mod.createGroupChatHostDriver() as GroupChatHostDriver;
  if (driver.kind !== "mist-host") {
    throw new Error('group-chat adapter must be typed kind: "mist-host"');
  }
  return {
    driver: cloneGroupChatDriverBoundary(driver),
    stubbed: new Set<string>(Array.isArray(mod.STUBBED) ? mod.STUBBED : []),
  };
}

async function runHostChecks(loaded: LoadedDriver): Promise<GroupChatRunResult[]> {
  const { driver, stubbed } = loaded;
  const host = await driver.startHost();
  const problem = hostProvenanceProblem(host, {
    headCommit: currentHeadCommit(),
    isProcessAlive: processIsAlive,
  });
  if (problem !== null) {
    await driver.stopHost();
    throw new Error(`real-host provenance check failed: ${problem}`);
  }

  const context = {
    findSourceLiterals: (terms: readonly string[]) =>
      findSourceLiterals(SOURCE_ROOT, terms, REPO_ROOT),
  };
  const results: GroupChatRunResult[] = [];
  try {
    for (const check of groupChatChecks) {
      try {
        const verdict = await runGroupChatCheck(check.id, driver, context);
        const isStubbed = check.uses.some((method) => stubbed.has(method));
        results.push({
          id: check.id,
          title: check.title,
          ...verdict,
          stubbed: isStubbed,
        });
      } catch (error) {
        results.push({
          id: check.id,
          title: check.title,
          passed: false,
          stubbed: false,
          detail: `scenario threw: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
  } finally {
    await driver.stopHost();
  }
  console.log(`真实宿主进程 PID ${host.pid}；代码 ${host.commit}`);
  return results;
}

async function main(): Promise<void> {
  const driver = await loadDriver();
  console.log("Mist #191 群聊验收：GC-01～05、GC-09、GC-15");
  console.log(`合成夹具：${groupChatSyntheticFixture.roomId}；不读取真实聊天/记忆/凭据`);
  console.log("");

  const results = driver === null ? missingDriverResults() : await runHostChecks(driver);
  const score = scoreGroupChatResults(results);
  for (const result of results) {
    console.log(
      `${result.passed ? (result.stubbed ? "🟡" : "🟢") : "🔴"} ${result.id} ${result.stubbed && result.passed ? `桩灯 — ${result.title}` : result.title}`,
    );
    console.log(`   ${result.detail}`);
  }
  console.log("");
  console.log(
    `真实宿主通过 ${driver === null ? 0 : score.trueGreen} / ${results.length}${score.stubGreen > 0 ? `；桩灯 ${score.stubGreen}` : ""}`,
  );
  if (driver === null) console.log("这轮只确认 PR1 的预期红灯；没有执行宿主正向/负向验收。");
  if (strict && !score.strictPass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
