/**
 * Fulfillment runs that outlive the browser.
 *
 * A bulk upload can take longer than anyone will sit and watch: nginx cuts the
 * request at 300s and the merchant may well close the app long before that. The
 * sheet is already parsed and the shop's token can be rotated without a request, so
 * there is no reason to abandon half of it — the run keeps going and the report is
 * waiting when they come back.
 *
 * What makes that safe is the slot. Before this existed, a merchant who closed the
 * app, saw no sign of the run and re-uploaded the same sheet started a second pass
 * over orders the first was still working through: fulfilled twice, customer emailed
 * twice, neither undoable. A shop holds one run at a time, and the page can ask what
 * is happening rather than guess.
 *
 * Two places keep state, for two different questions:
 *
 *  - `liveRuns` answers "is something happening right now". In memory, because that
 *    is the truth about this process and nothing else. It is gone after a restart,
 *    which is the right way to fail: a stale "busy" flag nobody can clear would lock
 *    a merchant out of their own app.
 *  - the run file answers "how did the last run end". On disk, because a run killed
 *    by a redeploy has to be reported honestly. Without it a half-finished report
 *    reads as a complete one — "25 fulfilled" for a sheet of 46, with nothing saying
 *    the other 21 were never attempted.
 *
 * Single container today. Behind more than one, `liveRuns` needs to move somewhere
 * shared or each container will hand out its own slot.
 */

import fs from "fs";
import path from "path";

import config from "../config/index.js";

/** Runs happening in this process, keyed by shop. */
const liveRuns = new Map();

/**
 * How long a run may go without progress before the slot is force-released.
 *
 * Only reachable if a batch wedges on something that never settles. Without it that
 * shop could never start another run.
 */
const STALE_MS = 15 * 60 * 1000;

/** Same sanitising as the report file: the shop domain is the untrusted part. */
const runPath = (shop) =>
  path.join(config.reportDir, `${String(shop).replace(/[^a-zA-Z0-9.-]/g, "_")}.run.json`);

const writeRecord = (shop, record) => {
  try {
    fs.mkdirSync(config.reportDir, { recursive: true });
    fs.writeFileSync(runPath(shop), JSON.stringify(record), "utf8");
  } catch (e) {
    // Never fail a run over its own bookkeeping.
    console.warn(`[run] could not write the run record for ${shop}:`, e.message);
  }
};

/** The persisted record of the most recent run, or null if there has never been one. */
export const readRunRecord = (shop) => {
  try {
    const record = JSON.parse(fs.readFileSync(runPath(shop), "utf8"));
    return record && typeof record === "object" ? record : null;
  } catch {
    return null;
  }
};

/** The run happening right now, or null when idle or after one wedged. */
export const getRun = (shop) => {
  const run = liveRuns.get(shop);
  if (!run) return null;

  if (Date.now() - run.updatedAt > STALE_MS) {
    console.warn(
      `[run] ${shop}: releasing a run with no progress since ${new Date(run.updatedAt).toISOString()}`
    );
    liveRuns.delete(shop);
    writeRecord(shop, {
      total: run.total,
      processed: run.processed,
      startedAt: new Date(run.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      interrupted: true,
    });
    return null;
  }

  return run;
};

/**
 * Take the run slot for a shop.
 *
 * @returns {{ok: true} | {ok: false, run: object}} the live run when one already holds it
 */
export const beginRun = (shop, total) => {
  const existing = getRun(shop);
  if (existing) return { ok: false, run: existing };

  const now = Date.now();
  liveRuns.set(shop, { total, processed: 0, startedAt: now, updatedAt: now });
  writeRecord(shop, {
    total,
    processed: 0,
    startedAt: new Date(now).toISOString(),
    finishedAt: null,
    interrupted: false,
  });

  return { ok: true };
};

/** Record progress, so the page can report it and a crash leaves a true count. */
export const advanceRun = (shop, processed) => {
  const run = liveRuns.get(shop);
  if (!run) return;

  run.processed = processed;
  run.updatedAt = Date.now();
  writeRecord(shop, {
    total: run.total,
    processed,
    startedAt: new Date(run.startedAt).toISOString(),
    finishedAt: null,
    interrupted: false,
  });
};

/** Release the slot. Must run whether the sheet finished or threw. */
export const finishRun = (shop, { interrupted = false } = {}) => {
  const run = liveRuns.get(shop);
  liveRuns.delete(shop);

  if (!run) return;

  writeRecord(shop, {
    total: run.total,
    processed: run.processed,
    startedAt: new Date(run.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    interrupted,
  });
};

/**
 * Close out runs that a restart killed.
 *
 * Called once at boot. `liveRuns` is empty in a fresh process, so any record still
 * saying "started, never finished" belonged to the process that died — its rows were
 * never going to be attempted, and the report on disk stops partway. Marking it
 * interrupted is what lets the app say so instead of presenting a half-run as whole.
 *
 * @returns {string[]} the shops whose runs were closed out
 */
export const reconcileOrphanedRuns = () => {
  const closed = [];

  let files = [];
  try {
    files = fs.readdirSync(config.reportDir).filter((f) => f.endsWith(".run.json"));
  } catch {
    // No report directory yet: nothing has ever run.
    return closed;
  }

  for (const file of files) {
    const full = path.join(config.reportDir, file);
    try {
      const record = JSON.parse(fs.readFileSync(full, "utf8"));
      if (!record || record.finishedAt) continue;

      fs.writeFileSync(
        full,
        JSON.stringify({
          ...record,
          finishedAt: new Date().toISOString(),
          interrupted: true,
        }),
        "utf8"
      );
      closed.push(file.replace(/\.run\.json$/, ""));
    } catch (e) {
      console.warn(`[run] could not reconcile ${file}:`, e.message);
    }
  }

  if (closed.length) {
    console.warn(`[run] marked ${closed.length} run(s) interrupted by a restart: ${closed.join(", ")}`);
  }

  return closed;
};

/** Forget everything about a shop's runs, for the shop/redact webhook. */
export const deleteRunRecord = (shop) => {
  liveRuns.delete(shop);
  try {
    fs.unlinkSync(runPath(shop));
    return true;
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.warn(`[run] could not delete the run record for ${shop}:`, e.message);
    }
    return false;
  }
};

export default {
  beginRun,
  advanceRun,
  finishRun,
  getRun,
  readRunRecord,
  reconcileOrphanedRuns,
  deleteRunRecord,
};
