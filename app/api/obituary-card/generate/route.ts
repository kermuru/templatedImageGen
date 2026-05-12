import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { GET } from "@/app/api/obituary-card/image/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, date_of_birth, date_died, photo_url } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Download photo to /tmp (writable on Vercel serverless)
  let savedPhotoParam: string | null = null;
  if (photo_url) {
    try {
      const res = await fetch(photo_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const ext = contentType.includes("png")  ? "png"
                : contentType.includes("webp") ? "webp"
                : "jpg";

      const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.${ext}`);
      await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
      savedPhotoParam = tmpPath;
    } catch (err) {
      console.error("[obituary/generate] photo download failed:", err);
    }
  }

  const imageUrl = new URL("/api/obituary-card/image", request.url);
  imageUrl.searchParams.set("name", name);
  if (date_of_birth)   imageUrl.searchParams.set("dob",   date_of_birth);
  if (date_died)       imageUrl.searchParams.set("died",  date_died);
  if (savedPhotoParam) imageUrl.searchParams.set("photo", savedPhotoParam);

  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  return NextResponse.json({
    url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
  });
}
