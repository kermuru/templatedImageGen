"use client";

import { useState } from "react";
import type { ObituaryCardData } from "../type";

export function ObituaryCardForm() {
  const [data, setData] = useState<ObituaryCardData>({
    full_name: "",
    date_of_birth: "",
    date_died: "",
    person_photo_url: "",
  });
  const [thumbSrc, setThumbSrc]     = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied]           = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbSrc(URL.createObjectURL(file));
    setIsUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/memorial-card/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const json: { url: string } = await res.json();
      setData((prev) => ({ ...prev, person_photo_url: json.url }));
    } catch {
      setUploadError("Photo upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function set(field: keyof ObituaryCardData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function handleGenerate() {
    const params = new URLSearchParams();
    if (data.full_name)       params.set("name", data.full_name);
    if (data.date_of_birth)   params.set("dob",  data.date_of_birth);
    if (data.date_died)       params.set("died", data.date_died);
    if (data.person_photo_url) params.set("photo", data.person_photo_url);
    setGeneratedUrl(
      `${window.location.origin}/api/obituary-card/image?${params.toString()}&t=${Date.now()}`
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedUrl.replace(/&t=\d+$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputClass =
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400">Obituary Card Generator</h1>
          <p className="text-slate-400 mt-1">Generate a memorial obituary card with the golden Renaissance template.</p>
        </div>

        <div className="flex flex-col xl:flex-row gap-8">

          {/* ── Form ── */}
          <div className="flex-1 max-w-xl bg-slate-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-amber-400 border-b border-slate-700 pb-3">Card Details</h2>

            {/* Photo */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Person Photo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-2 border-amber-500/50 overflow-hidden bg-slate-800 flex items-center justify-center flex-shrink-0">
                  {thumbSrc
                    ? <img src={thumbSrc} alt="thumb" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
                    : <span className="text-slate-500 text-2xl">👤</span>}
                </div>
                <div>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="obit-photo-upload" />
                  <label
                    htmlFor="obit-photo-upload"
                    className={`cursor-pointer inline-block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isUploading ? "bg-slate-700 text-slate-400 cursor-wait" : "bg-amber-600 hover:bg-amber-500 text-white"
                    }`}
                  >
                    {isUploading ? "Uploading…" : "Choose Photo"}
                  </label>
                  {data.person_photo_url && !isUploading && (
                    <p className="text-xs text-green-400 mt-1.5">✓ Photo uploaded</p>
                  )}
                  {uploadError && <p className="text-xs text-red-400 mt-1.5">{uploadError}</p>}
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Full Name <span className="text-amber-500">*</span></label>
              <input type="text" value={data.full_name} onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. Julian Valenzuela Casquero" className={inputClass} />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Date of Birth</label>
                <input type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Date of Death</label>
                <input type="date" value={data.date_died} onChange={(e) => set("date_died", e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!data.full_name || isUploading}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Generate Obituary Card
            </button>

            {/* URL output */}
            {generatedUrl && (
              <div className="bg-slate-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-slate-400">Shareable Image URL:</p>
                <div className="flex items-center gap-2">
                  <input type="text" value={generatedUrl.replace(/&t=\d+$/, "")} readOnly
                    className="flex-1 min-w-0 bg-slate-900 text-xs text-amber-300 rounded-lg px-3 py-2 focus:outline-none truncate" />
                  <button onClick={handleCopy}
                    className="flex-shrink-0 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap">
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Preview ── */}
          <div className="flex flex-col gap-4 flex-1">
            <h2 className="text-lg font-semibold text-amber-400">Preview</h2>
            {generatedUrl ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img key={generatedUrl} src={generatedUrl} alt="Obituary card preview"
                  className="rounded-xl w-full max-w-2xl shadow-lg" />
                <a href={generatedUrl.replace(/&t=\d+$/, "")} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  Open full size ↗
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl bg-slate-900 text-slate-600 text-sm"
                style={{ width: 600, height: 338 }}>
                Fill in the details and click &quot;Generate Obituary Card&quot;
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
