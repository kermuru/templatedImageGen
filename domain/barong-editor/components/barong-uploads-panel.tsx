"use client";

import { useCallback, useState } from "react";
import { dressUpload, getUploads, revertUpload } from "../api";
import type { BarongUpload } from "../type";

/**
 * Operator trigger for re-dressing a portrait the family uploaded through the
 * portal.
 *
 * Look up an interment document, see what was uploaded, and dress a photo on
 * demand. It is deliberately manual: each run is a paid generation, and dressing
 * a photo REPLACES what the lapida engraver and the video livestreaming supplier
 * will receive — so a person should see the result first.
 */
export function BarongUploadsPanel() {
  const [documentNo, setDocumentNo] = useState("");
  const [photos, setPhotos] = useState<BarongUpload[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async (doc: string) => {
    const trimmed = doc.trim();
    if (!trimmed) return;

    setBusy("load");
    setError(null);
    setNote(null);
    try {
      const d = await getUploads(trimmed);
      setPhotos(d.photos);
      if (d.photos.length === 0) setNote(`No photos uploaded against ${trimmed}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that document.");
      setPhotos(null);
    } finally {
      setBusy(null);
    }
  }, []);

  async function handleDress(p: BarongUpload) {
    const warning = p.dressed
      ? `Re-dress ${p.occupant ?? "this photo"}?\n\nThis pays for another edit and replaces the current one. It starts again from the family's original, not from the existing edit.`
      : `Dress ${p.occupant ?? "this photo"} in ${female(p) ? "a Filipiniana" : "a Barong"}?\n\nThis is a paid edit, and it REPLACES the photo the lapida engraver and video livestreaming supplier will receive. The family's original is kept and can be restored.`;

    if (!window.confirm(warning)) return;

    setBusy(`dress-${p.id}`);
    setError(null);
    setNote("Generating… this takes 1–3 minutes. Keep the tab open.");
    try {
      const r = await dressUpload(p.id, p.dressed);
      setPhotos((cur) => (cur ?? []).map((x) => (x.id === r.photo.id ? r.photo : x)));
      setNote(
        r.photo.gdrive_link
          ? `Done — dressed and archived to Drive.`
          : `Done — dressed. Drive archive skipped${r.photo.drive_error ? `: ${r.photo.drive_error}` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The edit failed.");
      setNote(null);
    } finally {
      setBusy(null);
    }
  }

  async function handleRevert(p: BarongUpload) {
    if (!window.confirm(`Restore the family's original photo for ${p.occupant ?? "this row"}?\n\nSuppliers will receive the original again from the next notification onward.`)) return;

    setBusy(`revert-${p.id}`);
    setError(null);
    try {
      const r = await revertUpload(p.id);
      setPhotos((cur) => (cur ?? []).map((x) => (x.id === r.photo.id ? r.photo : x)));
      setNote("Original restored.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revert.");
    } finally {
      setBusy(null);
    }
  }

  const anyBusy = busy !== null;

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold text-amber-400">Portal Uploads — Dress a Portrait</h1>
        <p className="mt-1 mb-6 text-sm text-slate-400">
          Look up an interment document and re-dress the photo the family uploaded. Dressing a photo
          replaces what the <span className="text-slate-200">lapida engraver</span> and{" "}
          <span className="text-slate-200">video livestreaming supplier</span> receive on their next
          service order. The original is always kept.
        </p>

        <form
          className="mb-5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(documentNo);
          }}
        >
          <input
            value={documentNo}
            onChange={(e) => setDocumentNo(e.target.value)}
            placeholder="Document no. — e.g. NLIO00977"
            className="min-w-[16rem] flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 transition-colors focus:border-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={anyBusy || !documentNo.trim()}
            className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {busy === "load" ? "Loading…" : "Look up"}
          </button>
        </form>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 px-3.5 py-2.5 text-sm font-semibold text-red-400">
            {error}
          </div>
        )}
        {note && (
          <div className="mb-4 rounded-lg bg-emerald-500/10 px-3.5 py-2.5 text-sm font-semibold text-emerald-400">
            {note}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {(photos ?? []).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-800 bg-slate-900 p-4"
            >
              <Thumb label="Original" url={p.original_url ?? p.photo_url} onOpen={setLightbox} />
              <Thumb
                label="To supplier"
                url={p.dressed ? p.photo_url : null}
                onOpen={setLightbox}
                highlight={p.dressed}
              />

              <div className="min-w-[12rem] flex-1">
                <div className="font-semibold">{p.occupant || "(unnamed)"}</div>
                <div className="text-xs text-slate-500">
                  #{p.id} · {p.gender || "no gender on file"} →{" "}
                  {female(p) ? "Filipiniana" : "Barong"}
                </div>
                {p.dressed ? (
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                    dressed
                    {p.gdrive_link && (
                      <>
                        {" · "}
                        <a
                          href={p.gdrive_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300"
                        >
                          in Drive ↗
                        </a>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    original — untouched
                  </div>
                )}
                {p.drive_error && (
                  <div className="mt-1 max-w-md text-[11px] text-amber-400">
                    Drive archive failed: {p.drive_error}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleDress(p)}
                  disabled={anyBusy}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                >
                  {busy === `dress-${p.id}` ? "Generating…" : p.dressed ? "Re-dress" : "Dress"}
                </button>
                {p.dressed && (
                  <button
                    onClick={() => handleRevert(p)}
                    disabled={anyBusy}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    {busy === `revert-${p.id}` ? "Reverting…" : "Restore original"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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

/** The sheet's gender value decides the garment; mirror the backend's reading. */
function female(p: BarongUpload): boolean {
  const v = (p.gender ?? "").trim().toLowerCase();
  return ["f", "female", "fem", "woman", "women", "girl", "ms", "mrs", "miss", "babae"].includes(v);
}

function Thumb({
  label,
  url,
  onOpen,
  highlight = false,
}: {
  label: string;
  url: string | null;
  onOpen: (u: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={label}
          onClick={() => onOpen(url)}
          className={`h-24 w-24 cursor-zoom-in rounded-lg border object-cover ${
            highlight ? "border-emerald-500/60" : "border-slate-700"
          }`}
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-slate-700 text-[10px] text-slate-600">
          not yet
        </div>
      )}
      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
