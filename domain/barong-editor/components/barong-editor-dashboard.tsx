"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchPending,
  getStatus,
  jobImageUrl,
  processNext,
  reprocess,
  retryStuck,
  syncSheet,
} from "../api";
import type { BarongConfig, BarongCounts, BarongJob, BarongStatus } from "../type";

const EMPTY_COUNTS: BarongCounts = { pending: 0, processing: 0, done: 0, failed: 0 };

/** Idle poll interval — paused while this page is driving the queue itself. */
const POLL_MS = 4000;

const STATUS_CLASS: Record<BarongStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  processing: "bg-sky-500/15 text-sky-400",
  done: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-red-500/15 text-red-400",
};

const COUNT_CLASS: Record<BarongStatus, string> = {
  pending: "text-amber-400",
  processing: "text-sky-400",
  done: "text-emerald-400",
  failed: "text-red-400",
};

const STATUSES: BarongStatus[] = ["pending", "processing", "done", "failed"];

const GARMENT_LABEL: Record<string, string> = {
  barong: "Barong",
  filipiniana: "Filipiniana",
};

/** Garment chip. Until a job runs, `garment` is null — the sheet's sex value is all we have. */
function GarmentTag({ job }: { job: BarongJob }) {
  if (!job.garment && !job.sex) return null;

  const resolved = job.garment ? GARMENT_LABEL[job.garment] ?? job.garment : null;
  const tone = job.garment === "filipiniana" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-slate-700/50 text-slate-300";

  return (
    <span
      className={`${tone} ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide`}
      title={job.sex ? `sheet sex: ${job.sex}` : "no sex value in the sheet — using the default garment"}
    >
      {resolved ?? `${job.sex} · pending`}
    </span>
  );
}

function fmtWhen(value: string | null) {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function Spinner({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <span
      className={`${className} inline-block animate-spin rounded-full border-2 border-slate-700 border-t-sky-400`}
    />
  );
}

function StatusBadge({ status }: { status: BarongStatus }) {
  return (
    <span
      className={`${STATUS_CLASS[status]} rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide`}
    >
      {status}
    </span>
  );
}

function Stat({ label, value }: { label: BarongStatus; value: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs text-slate-400">
      {label}
      <b className={`${COUNT_CLASS[label]} text-sm`}>{value}</b>
    </span>
  );
}

/** Before/after cell: with no stored file yet, show a placeholder rather than a request that 404s. */
function Thumb({
  job,
  type,
  onOpen,
}: {
  job: BarongJob;
  type: "input" | "output";
  onOpen: (url: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const path = type === "input" ? job.input_path : job.output_path;

  if (!path || broken) {
    return (
      <span className="inline-flex h-13 w-13 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-[10px] text-slate-500">
        {broken ? "n/a" : "—"}
      </span>
    );
  }

  const url = jobImageUrl(job.id, type, job.updated_at);

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={`${type} for job ${job.id}`}
      onClick={() => onOpen(url)}
      onError={() => setBroken(true)}
      className="h-13 w-13 cursor-zoom-in rounded-md border border-slate-700 bg-slate-800 object-cover"
    />
  );
}

export function BarongEditorDashboard() {
  const [jobs, setJobs] = useState<BarongJob[]>([]);
  const [counts, setCounts] = useState<BarongCounts>(EMPTY_COUNTS);
  const [config, setConfig] = useState<BarongConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [busy, setBusy] = useState<string | null>(null); // which button is mid-flight
  const [running, setRunning] = useState(false); // the live process loop
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Read inside the loop so "Stop" takes effect on the next iteration (state
  // captured in the closure would stay stale for the whole run).
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const d = await getStatus();
      setJobs(d.jobs ?? []);
      setCounts(d.counts ?? EMPTY_COUNTS);
      setConfig(d.config ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the job list.");
    } finally {
      setLoaded(true);
    }
  }, []);

  // Live monitor: load once, then poll while idle. Polling is paused during the
  // process loop, which refreshes after every job anyway, and resumes (with an
  // immediate read) the moment the loop stops. Both reads go through timers, so
  // the state updates land in a callback rather than in the effect body.
  useEffect(() => {
    if (running) return;
    const first = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [running, refresh]);

  useEffect(() => () => {
    runningRef.current = false; // stop the loop on unmount
  }, []);

  async function guard(key: string, run: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(null);
    }
  }

  const handleSync = () =>
    guard("sync", async () => {
      const r = await syncSheet();
      setNote(`Synced: +${r.created} new (${r.eligible} eligible, ${r.skipped} already queued).`);
      await refresh();
    });

  /**
   * Drain the queue from the browser, one photo at a time, so each job can be
   * watched live. Each call is a paid edit that blocks for minutes.
   */
  async function handleRun() {
    setError(null);
    setNote(null);
    setRunning(true);
    runningRef.current = true;

    try {
      while (runningRef.current) {
        setNote("Processing the next photo… this takes 1–3 minutes per edit.");
        const r = await processNext();
        await refresh();

        if (!r.processed) {
          setNote("All pending photos are processed.");
          break;
        }

        const j = r.job;
        setNote(j ? `Job #${j.id} → ${j.status}${j.error ? ` — ${j.error}` : ""}` : "Processed.");
      }
      if (!runningRef.current) setNote("Stopped. Pending photos were left in the queue.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing stopped on a network error.");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  function handleStop() {
    runningRef.current = false;
    setNote("Stopping after the photo currently in flight…");
  }

  const handleDispatch = () =>
    guard("dispatch", async () => {
      if (
        !window.confirm(
          "Hand every pending photo to the backend queue worker?\n\n" +
            "Each one is a paid OpenAI image edit. Progress shows up here as the worker gets through them.",
        )
      )
        return;
      const r = await dispatchPending();
      setNote(`Queued ${r.dispatched ?? 0} photo(s) on the worker.`);
      await refresh();
    });

  const handleRetry = () =>
    guard("retry", async () => {
      const r = await retryStuck();
      setNote(`Requeued ${r.requeued ?? 0} failed/stuck job(s) — run them with "Process pending".`);
      await refresh();
    });

  const handleReprocessAll = () =>
    guard("reprocess", async () => {
      if (
        !window.confirm(
          "Re-run EVERY job, including the ones already done?\n\n" +
            "This overwrites their outputs and pays for each edit again.",
        )
      )
        return;
      const r = await reprocess();
      setNote(`Requeued ${r.requeued ?? 0} job(s) — run them with "Process pending".`);
      await refresh();
    });

  const reprocessOne = (job: BarongJob) =>
    guard(`re-${job.id}`, async () => {
      if (!window.confirm(`Re-run job #${job.id} (${job.name ?? "unnamed"})? This pays for another edit.`))
        return;
      const r = await reprocess(job.id);
      setNote(`Requeued ${r.requeued ?? 0} job(s) — run them with "Process pending".`);
      await refresh();
    });

  const disabled = running || busy !== null;

  const primaryBtn =
    "inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500";
  const ghostBtn =
    "inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600";
  const stopBtn =
    "inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500";
  const th =
    "whitespace-nowrap border-b border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500";
  const td = "px-3 py-2.5 align-middle text-[13px] text-slate-200";

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400">Barong Image Editor</h1>
          <p className="mt-1 text-sm text-slate-400">
            Re-dresses each person in the source sheet — Barong Tagalog, or Filipiniana where the
            sheet&apos;s <code className="text-amber-300">sex</code> column says female.
            {config && (
              <>
                {" "}
                Engine <code className="text-amber-300">{config.model}</code> · rows where{" "}
                <code className="text-amber-300">action = {config.filter.action}</code> and{" "}
                <code className="text-amber-300">status ≠ {config.filter.status_not}</code> with a
                photolink · mask <code className="text-amber-300">{config.mask_mode}</code> · body
                detect <code className="text-amber-300">{config.detect_mode}</code> · default garment{" "}
                <code className="text-amber-300">{config.garment_default}</code>.
              </>
            )}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={handleSync} disabled={disabled} className={primaryBtn}>
            {busy === "sync" && <Spinner />} Sync from sheet
          </button>

          {running ? (
            <button onClick={handleStop} className={stopBtn}>
              ■ Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={disabled || counts.pending === 0}
              className={primaryBtn}
            >
              ▶ Process pending{counts.pending ? ` (${counts.pending})` : ""}
            </button>
          )}

          <button
            onClick={handleDispatch}
            disabled={disabled || counts.pending === 0}
            className={ghostBtn}
          >
            {busy === "dispatch" && <Spinner />} Queue on worker
          </button>
          <button onClick={handleRetry} disabled={disabled} className={ghostBtn}>
            {busy === "retry" && <Spinner />} Retry failed/stuck
          </button>
          <button onClick={handleReprocessAll} disabled={disabled} className={ghostBtn}>
            {busy === "reprocess" && <Spinner />} Reprocess all
          </button>

          <span className="ml-auto flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Stat key={s} label={s} value={counts[s]} />
            ))}
          </span>
        </div>

        <div className="mb-4 flex flex-col gap-2.5">
          {error && (
            <div className="rounded-lg bg-red-500/10 px-3.5 py-2.5 text-sm font-semibold text-red-400">
              {error}
            </div>
          )}
          {note && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3.5 py-2.5 text-sm font-semibold text-emerald-400">
              {running && <Spinner />}
              {note}
            </div>
          )}
          {running && (
            <div className="rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-sm font-semibold text-amber-400">
              Keep this tab open — the browser is driving the queue one photo at a time. Use “Queue on
              worker” instead to let the backend finish them unattended.
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
          <table className="w-full min-w-[940px] border-collapse">
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>Name</th>
                <th className={th}>Status</th>
                <th className={th}>Before</th>
                <th className={th}>After</th>
                <th className={th}>Source</th>
                <th className={th}>Detail</th>
                <th className={th}>Took</th>
                <th className={th}>Updated</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {!loaded && (
                <tr>
                  <td className={`${td} text-slate-500`} colSpan={10}>
                    <Spinner /> Loading…
                  </td>
                </tr>
              )}

              {loaded && jobs.length === 0 && (
                <tr>
                  <td className={`${td} text-slate-500`} colSpan={10}>
                    No jobs yet — start with “Sync from sheet”.
                  </td>
                </tr>
              )}

              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-slate-800 last:border-0">
                  <td className={`${td} text-slate-500`}>{job.id}</td>
                  <td className={`${td} font-semibold`}>
                    {job.name || "(unnamed)"}
                    <GarmentTag job={job} />
                    {job.extended && (
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        rebuilt from {(job.framing ?? "crop").replace(/_/g, " ")}
                        {job.arms_cut && " + arms"}
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-1.5">
                      {job.status === "processing" && <Spinner />}
                      <StatusBadge status={job.status} />
                      {job.attempts > 1 && (
                        <span className="text-[11px] text-slate-500">×{job.attempts}</span>
                      )}
                    </span>
                  </td>
                  {/* Keyed on updated_at: a row that 404'd while still processing
                      remounts when the job moves on, so a stale "n/a" clears itself
                      and the finished image gets a fresh try. */}
                  <td className={td}>
                    <Thumb key={job.updated_at} job={job} type="input" onOpen={setLightbox} />
                  </td>
                  <td className={td}>
                    <Thumb key={job.updated_at} job={job} type="output" onOpen={setLightbox} />
                  </td>
                  <td className={td}>
                    <a
                      href={job.photolink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 transition-colors hover:text-sky-300"
                    >
                      link ↗
                    </a>
                  </td>
                  <td className={`${td} max-w-[260px] text-[11px] whitespace-normal text-red-400`}>
                    {job.error || ""}
                  </td>
                  <td className={`${td} text-xs text-slate-500`}>{fmtDuration(job.duration_ms)}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-slate-500`}>
                    {fmtWhen(job.updated_at)}
                  </td>
                  <td className={td}>
                    {(job.status === "done" || job.status === "failed") && (
                      <button
                        onClick={() => reprocessOne(job)}
                        disabled={disabled}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-600"
                      >
                        {busy === `re-${job.id}` && <Spinner className="h-2.5 w-2.5" />} Re-run
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Jobs are deduplicated by photolink, so re-syncing never re-queues — or re-pays for — a photo
          already in the list. Like the original workflow this stops after the edit: nothing is written
          back to the sheet.
        </p>
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-8"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[92vh] max-w-[92vw] rounded-lg" />
        </div>
      )}
    </div>
  );
}
