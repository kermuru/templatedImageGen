import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { GET } from "@/app/api/obituary-card/image/route";

export const runtime = "nodejs";

/**
 * POST /api/obituary-card/generate
 *
 * n8n webhook endpoint. Accepts JSON, generates the obituary card image,
 * saves it to disk, and returns a public URL.
 *
 * Body fields:
 *   name           string  required  Full name of the deceased
 *   date_of_birth  string  optional  ISO date e.g. "1956-01-28"
 *   date_died      string  optional  ISO date e.g. "2026-03-20"
 *   photo_url      string  optional  Public URL of the person's photo
 *
 * Response:
 *   { "url": "https://your-domain.com/generated/obituary/<uuid>.jpg" }
 */
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

  // Download photo and save locally so the image pipeline can access it
  let savedPhotoParam: string | null = null;
  if (photo_url) {
    try {
      const res = await fetch(photo_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const ext = contentType.includes("png")  ? "png"
                : contentType.includes("webp") ? "webp"
                : "jpg";

      const filename = `${crypto.randomUUID()}.${ext}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "obituary");
      await writeFile(path.join(uploadDir, filename), Buffer.from(await res.arrayBuffer()));
      savedPhotoParam = `/uploads/obituary/${filename}`;
    } catch (err) {
      console.error("[obituary/generate] photo download failed:", err);
    }
  }

  // Build the query-string the GET handler expects
  const imageUrl = new URL("/api/obituary-card/image", request.url);
  imageUrl.searchParams.set("name", name);
  if (date_of_birth)   imageUrl.searchParams.set("dob",   date_of_birth);
  if (date_died)       imageUrl.searchParams.set("died",  date_died);
  if (savedPhotoParam) imageUrl.searchParams.set("photo", savedPhotoParam);

  // Generate the image
  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  // Save to public/generated/obituary/ and return a public URL
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const outputFilename = `${crypto.randomUUID()}.jpg`;
  const outputDir = path.join(process.cwd(), "public", "generated", "obituary");
  await writeFile(path.join(outputDir, outputFilename), imageBuffer);

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    url: `${origin}/generated/obituary/${outputFilename}`,
  });
}
