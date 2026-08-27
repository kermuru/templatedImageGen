import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Strip the photo background via remove.bg so the figure drops cleanly into the
 * arch (no white box). Returns a transparent PNG buffer, or the original bytes
 * if the key is missing / the call fails (non-fatal).
 */
async function stripBackground(bytes: Buffer): Promise<{ buffer: Buffer; removed: boolean }> {
  const key = process.env.REMOVE_BG_API_KEY;
  if (!key) return { buffer: bytes, removed: false };
  try {
    const form = new FormData();
    form.append("image_file", new Blob([new Uint8Array(bytes)]), "photo.png");
    form.append("size", "auto");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key },
      body: form,
    });
    if (res.ok) {
      return { buffer: Buffer.from(await res.arrayBuffer()), removed: true };
    }
    console.error("[memorial-card-v2/upload] remove.bg failed:", res.status, await res.text());
  } catch (err) {
    console.error("[memorial-card-v2/upload] remove.bg error:", err);
  }
  return { buffer: bytes, removed: false };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("photo");
  // Background removal is OFF by default; callers opt in with remove_bg=1.
  const removeBg = String(formData.get("remove_bg") ?? "0") === "1";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File size must be under 10 MB" },
      { status: 400 }
    );
  }

  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let removed = false;

  if (removeBg) {
    const stripped = await stripBackground(buffer);
    buffer = stripped.buffer;
    removed = stripped.removed;
  }

  // Always store as PNG so the transparent cutout is preserved.
  const filename = `${randomUUID()}.png`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "memorial-v2");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  return NextResponse.json({ url: `/uploads/memorial-v2/${filename}`, bg_removed: removed });
}
