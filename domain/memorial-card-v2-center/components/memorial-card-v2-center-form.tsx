"use client";

import { useState } from "react";
import type { MemorialCardV2CenterData } from "../type";

export function MemorialCardV2CenterForm() {
  const [data, setData] = useState<MemorialCardV2CenterData>({
    full_name: "",
    date_of_interment: "",
    mass_service_time: "",
    interment_service_time: "",
    location: "Renaissance Park",
    date_of_birth: "",
    date_died: "",
    date_of_mass: "",
    person_photo_url: "",
  });
  const [thumbSrc, setThumbSrc] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [removeBg, setRemoveBg] = useState(false); // remove.bg is opt-in (off for testing)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbSrc(URL.createObjectURL(file));
    setIsUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("remove_bg", removeBg ? "1" : "0");
      const res = await fetch("/api/memorial-card-v2-center/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const json: { url: string } = await res.json();
      setData((prev) => ({ ...prev, person_photo_url: json.url }));
    } catch {
      setUploadError("Photo upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function set(field: keyof MemorialCardV2CenterData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function buildParams() {
    const params = new URLSearchParams();
    if (data.full_name) params.set("name", data.full_name);
    if (data.date_of_interment) params.set("interment", data.date_of_interment);
    if (data.mass_service_time) params.set("mass_time", data.mass_service_time);
    if (data.interment_service_time) params.set("interment_time", data.interment_service_time);
    if (data.location) params.set("location", data.location);
    if (data.date_of_birth) params.set("dob", data.date_of_birth);
    if (data.date_died) params.set("died", data.date_died);
    if (data.date_of_mass) params.set("mass_date", data.date_of_mass);
    if (data.person_photo_url) params.set("photo", data.person_photo_url);
    return params.toString();
  }

  function handleGenerate() {
    setGeneratedUrl(`${window.location.origin}/api/memorial-card-v2-center/image?${buildParams()}&t=${Date.now()}`);
  }

  async function handleCopy() {
    const clean = generatedUrl.replace(/&t=\d+$/, "");
    await navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputClass =
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400">Memorial Card Generator — V2 Center</h1>
          <p className="text-slate-400 mt-1">
            Centered arch template. Fill in the details and generate a shareable memorial card image.
          </p>
        </div>

        <div className="flex flex-col xl:flex-row gap-8">

          {/* ── Form ── */}
          <div className="flex-1 max-w-xl bg-slate-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-amber-400 border-b border-slate-700 pb-3">Service Details</h2>

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
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" id="photo-upload" />
                  <label
                    htmlFor="photo-upload"
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
              <label className="flex items-center gap-2 mt-3 text-xs text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={removeBg}
                  onChange={(e) => setRemoveBg(e.target.checked)}
                  className="accent-amber-500"
                />
                Remove background (remove.bg) — off for testing; re-select photo after toggling
              </label>
              <p className="text-xs text-slate-500 mt-2">
                Tip: with removal off, upload a transparent-PNG cutout so it blends into the arch.
              </p>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Full Name <span className="text-amber-500">*</span></label>
              <input type="text" value={data.full_name} onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. San Juan Pedro" className={inputClass} />
            </div>

            {/* Date of Interment */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Date of Interment <span className="text-amber-500">*</span></label>
              <input type="date" value={data.date_of_interment} onChange={(e) => set("date_of_interment", e.target.value)} className={inputClass} />
            </div>

            {/* Service times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Mass Service Time</label>
                <input type="text" value={data.mass_service_time} onChange={(e) => set("mass_service_time", e.target.value)}
                  placeholder="e.g. 9:30 AM" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Interment Service Time</label>
                <input type="text" value={data.interment_service_time} onChange={(e) => set("interment_service_time", e.target.value)}
                  placeholder="e.g. 10:00 AM" className={inputClass} />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Location <span className="text-slate-600 text-xs">(baked into this template)</span>
              </label>
              <input type="text" value={data.location} onChange={(e) => set("location", e.target.value)}
                placeholder="e.g. Renaissance Park" className={inputClass} />
            </div>

            {/* Extra fields */}
            <div>
              <button type="button" onClick={() => setShowExtra((v) => !v)}
                className="text-sm text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1">
                <span>{showExtra ? "▾" : "▸"}</span> Additional dates (birth, death, mass date)
              </button>
              {showExtra && (
                <div className="mt-4 space-y-4 pl-4 border-l border-slate-700">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Date of Birth</label>
                      <input type="date" value={data.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Date Died</label>
                      <input type="date" value={data.date_died} onChange={(e) => set("date_died", e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Date of Mass <span className="text-slate-600 text-xs">(if different from interment date)</span>
                    </label>
                    <input type="date" value={data.date_of_mass} onChange={(e) => set("date_of_mass", e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}
            </div>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!data.full_name || !data.date_of_interment || isUploading}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Generate Memorial Card V2 Center
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
                <img
                  key={generatedUrl}
                  src={generatedUrl}
                  alt="Memorial card V2 center preview"
                  className="rounded-xl w-full max-w-2xl shadow-lg"
                />
                <a href={generatedUrl.replace(/&t=\d+$/, "")} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  Open full size ↗
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl bg-slate-900 text-slate-600 text-sm"
                style={{ width: 600, height: 400 }}>
                Fill in the details and click &quot;Generate Memorial Card V2 Center&quot;
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
