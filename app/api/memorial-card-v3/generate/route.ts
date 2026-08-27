import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { put } from "@vercel/blob";
import { GET } from "@/app/api/memorial-card-v3/image/route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name, date_of_interment, mass_time, interment_time, photo_url,
    // V3 renders the venue rather than baking it, so another chapel needs no
    // new template. Omitting these keeps the reference artwork's defaults.
    location, location_sub, time_caption,
  } = body;

  if (!name || !date_of_interment) {
    return NextResponse.json(
      { error: "name and date_of_interment are required" },
      { status: 400 }
    );
  }

  let savedPhotoParam: string | null = null;
  if (photo_url) {
    try {
      const res = await fetch(photo_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const ext = contentType.includes("png") ? "png"
                : contentType.includes("webp") ? "webp"
                : "jpg";

      const tmpPath = path.join(os.tmpdir(), `${crypto.randomUUID()}.${ext}`);
      await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
      savedPhotoParam = tmpPath;
    } catch (err) {
      console.error("[memorial-card-v3/generate] photo download failed:", err);
    }
  }

  const imageUrl = new URL("/api/memorial-card-v3/image", request.url);
  imageUrl.searchParams.set("name", name);
  imageUrl.searchParams.set("interment", date_of_interment);
  if (mass_time)       imageUrl.searchParams.set("mass_time", mass_time);
  if (interment_time)  imageUrl.searchParams.set("interment_time", interment_time);
  if (location)        imageUrl.searchParams.set("location", location);
  if (location_sub)    imageUrl.searchParams.set("location_sub", location_sub);
  if (time_caption)    imageUrl.searchParams.set("time_caption", time_caption);
  if (savedPhotoParam) imageUrl.searchParams.set("photo", savedPhotoParam);

  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const filename = `memorial-v3/${crypto.randomUUID()}.png`;

  const blob = await put(filename, imageBuffer, {
    access: "public",
    contentType: "image/png",
  });

  return NextResponse.json({ url: blob.url });
}
