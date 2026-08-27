import type {
  BarongUploadsResponse,
  BarongUploadResult,
  BarongCountResult,
  BarongProcessResult,
  BarongStatusResponse,
  BarongSyncResult,
} from "./type";

/**
 * Barong Image Editor — sheet-driven batch photo re-dressing.
 *
 * Backend: `App\Domain\BarongEditor` in core-system, migrated there from the
 * standalone barong-image-editor PHP app (itself a port of the n8n workflow
 * "My workflow 20"). Per eligible row of a public Google Sheet: download
 * `photolink` → OpenAI /v1/images/edits with the Barong prompt → store the PNG.
 *
 * These run from the BROWSER (the dashboard polls and drives the queue), so
 * unlike auto-hiring's api.ts there is no `revalidateTag` here — that is
 * server-only and would throw in a client component.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";
const BASE = `${API}/v1/barong-editor`;

function headers(): HeadersInit {
  return { Accept: "application/json" };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
    cache: "no-store",
  });

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new Error(message);
  }

  return body as T;
}

export const getStatus = () => request<BarongStatusResponse>("/status");

/** Pull the sheet and queue a job per eligible row (deduped by photolink). */
export const syncSheet = () => request<BarongSyncResult>("/sync", { method: "POST" });

/**
 * Run the next pending job to completion. Slow by design — one paid edit, so the
 * request blocks for the 1–3 minutes it actually takes.
 */
export const processNext = () => request<BarongProcessResult>("/process-next", { method: "POST" });

/** Hand every pending job to the backend queue worker instead of looping here. */
export const dispatchPending = () => request<BarongCountResult>("/dispatch", { method: "POST" });

/** Requeue failed + stuck-in-processing jobs. */
export const retryStuck = () => request<BarongCountResult>("/retry", { method: "POST" });

/**
 * Requeue jobs that already ran, for a fresh edit (e.g. after the prompt or the
 * mask mode changed). Without an id this re-pays for every settled job.
 */
export const reprocess = (id?: number) =>
  request<BarongCountResult>(`/reprocess${id ? `/${id}` : ""}`, { method: "POST" });

/**
 * URL of a job's before/after image. `stamp` (the job's updated_at) busts the
 * browser cache so a reprocessed photo shows its new output, not the old one.
 */
export function jobImageUrl(id: number, type: "input" | "output", stamp?: string | null): string {
  const params = new URLSearchParams({ type });
  if (stamp) params.set("t", String(Date.parse(stamp) || ""));
  return `${BASE}/jobs/${id}/image?${params.toString()}`;
}

/* ── Portal uploads ────────────────────────────────────────────────────────
 * Operator-triggered re-dressing of a family's uploaded portrait. Deliberately
 * not automatic on upload: each run is a paid generation, and an AI-altered
 * photo of the deceased should have a person look at it before suppliers do.
 */

/** Photos uploaded against one interment document. */
export const getUploads = (documentNo: string) =>
  request<BarongUploadsResponse>(`/uploads/${encodeURIComponent(documentNo)}`);

/**
 * Dress one uploaded portrait. Slow by design — one paid edit, 1–3 minutes —
 * and on success the supplier-facing photo is replaced.
 */
export const dressUpload = (id: number, force = false) =>
  request<BarongUploadResult>(`/uploads/${id}/dress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });

/** Put the family's original photo back. Generates nothing, costs nothing. */
export const revertUpload = (id: number) =>
  request<BarongUploadResult>(`/uploads/${id}/revert`, { method: "POST" });
