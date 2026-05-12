"use client";

import { useState } from "react";
import type { LotAvailabilityData } from "../type";

export function LotAvailabilityForm() {
  const [data, setData] = useState<LotAvailabilityData>({
    area_no: "",
    block_no: "",
    lot_type: "",
    available_count: "",
  });
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [copied, setCopied] = useState(false);

  function set(field: keyof LotAvailabilityData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function handleGenerate() {
    const params = new URLSearchParams();
    if (data.area_no)        params.set("area_no",        String(data.area_no));
    if (data.block_no)       params.set("block_no",       String(data.block_no));
    if (data.lot_type)       params.set("lot_type",       String(data.lot_type));
    if (data.available_count) params.set("available_count", String(data.available_count));
    setGeneratedUrl(
      `${window.location.origin}/api/lot-availability/image?${params.toString()}&t=${Date.now()}`
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(generatedUrl.replace(/&t=\d+$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputClass =
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none transition-colors";

  const isValid = data.area_no && data.block_no && data.lot_type && data.available_count;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400">Lot Availability Generator</h1>
          <p className="text-slate-400 mt-1">Generate a lot availability update card image.</p>
        </div>

        <div className="flex flex-col xl:flex-row gap-8">

          {/* ── Form ── */}
          <div className="flex-1 max-w-xl bg-slate-900 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-amber-400 border-b border-slate-700 pb-3">Lot Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Area No. <span className="text-amber-500">*</span></label>
                <input type="text" value={data.area_no} onChange={(e) => set("area_no", e.target.value)}
                  placeholder="e.g. 2" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Block No. <span className="text-amber-500">*</span></label>
                <input type="text" value={data.block_no} onChange={(e) => set("block_no", e.target.value)}
                  placeholder="e.g. 13" className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Lot Type <span className="text-amber-500">*</span></label>
              <input type="text" value={data.lot_type} onChange={(e) => set("lot_type", e.target.value)}
                placeholder="e.g. PREMIUM LAWN" className={inputClass} />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Available Count <span className="text-amber-500">*</span></label>
              <input type="number" min="0" value={data.available_count} onChange={(e) => set("available_count", e.target.value)}
                placeholder="e.g. 5" className={inputClass} />
            </div>

            <button
              onClick={handleGenerate}
              disabled={!isValid}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              Generate Card
            </button>

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
                <img key={generatedUrl} src={generatedUrl} alt="Lot availability card preview"
                  className="rounded-xl w-full max-w-lg shadow-lg" />
                <a href={generatedUrl.replace(/&t=\d+$/, "")} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors">
                  Open full size ↗
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-xl bg-slate-900 text-slate-600 text-sm"
                style={{ width: 400, height: 500 }}>
                Fill in the details and click &quot;Generate Card&quot;
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
