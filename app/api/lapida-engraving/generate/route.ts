import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { GET } from "@/app/api/lapida-engraving/image/route";
import type { LapidaEngravingData } from "@/domain/lapida-engraving/type";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Partial<LapidaEngravingData>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { occupants, photo_url, photo_base64, lot_no, skip_bg_removal, gamma } = body;

  if (!Array.isArray(occupants) || occupants.length === 0) {
    return NextResponse.json(
      { error: "occupants is required (non-empty array)" },
      { status: 400 }
    );
  }
  if (!lot_no) {
    return NextResponse.json({ error: "lot_no is required" }, { status: 400 });
  }

  // Resolve photo bytes — prefer base64 (no network hop) over URL fetch
  let savedPhotoPath: string | null = null;
  const rawPhotoSource = photo_base64 ?? photo_url;

  if (rawPhotoSource) {
    try {
      let photoBytes: Buffer;

      if (photo_base64) {
        photoBytes = Buffer.from(photo_base64, "base64");
      } else {
        const res = await fetch(photo_url!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        photoBytes = Buffer.from(await res.arrayBuffer());
      }

      // ── 1. remove.bg: strip background
      const removeBgKey = process.env.REMOVE_BG_API_KEY;
      if (removeBgKey && !skip_bg_removal) {
        try {
          const bgForm = new FormData();
          bgForm.append("image_file", new Blob([new Uint8Array(photoBytes)]), "photo.jpg");
          bgForm.append("size", "auto");
          const bgRes = await fetch("https://api.remove.bg/v1.0/removebg", {
            method: "POST",
            headers: { "X-Api-Key": removeBgKey },
            body: bgForm,
          });
          if (bgRes.ok) {
            photoBytes = Buffer.from(await bgRes.arrayBuffer());
            console.log("[lapida-engraving/generate] remove.bg: background removed");
          } else {
            console.error("[lapida-engraving/generate] remove.bg failed:", bgRes.status, await bgRes.text());
          }
        } catch (bgErr) {
          console.error("[lapida-engraving/generate] remove.bg error:", bgErr);
        }
      }

      const tmp = path.join(os.tmpdir(), `${crypto.randomUUID()}.png`);
      await writeFile(tmp, photoBytes);
      savedPhotoPath = tmp;
    } catch (err) {
      console.error("[lapida-engraving/generate] photo processing failed:", err);
      // Non-fatal — proceed without photo
    }
  }

  // Build the internal image URL and delegate to the image route
  const imageUrl = new URL("/api/lapida-engraving/image", request.url);
  imageUrl.searchParams.set("occupants", JSON.stringify(occupants));
  imageUrl.searchParams.set("lot_no", lot_no);
  if (savedPhotoPath) imageUrl.searchParams.set("photo", savedPhotoPath);
  if (gamma != null)  imageUrl.searchParams.set("gamma", String(gamma));

  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const filename    = `lapida-engraving/${crypto.randomUUID()}.png`;

  const blob = await put(filename, imageBuffer, {
    access: "public",
    contentType: "image/png",
  });

  return NextResponse.json({ url: blob.url });
}
