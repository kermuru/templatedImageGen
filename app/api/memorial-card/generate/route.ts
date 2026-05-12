import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { GET } from "@/app/api/memorial-card/image/route";

export const runtime = "nodejs";

/**
 * POST /api/memorial-card/generate
 *
 * n8n webhook endpoint. Accepts JSON, saves the generated memorial card to
 * disk, and returns a public URL.
 *
 * Body fields:
 *   name              string  required  Full name of the deceased
 *   date_of_interment string  required  ISO date e.g. "2026-05-11"
 *   interment_time    string  optional  e.g. "10:00 AM"
 *   location          string  optional  default "Renaissance Park"
 *   photo_url         string  optional  Public URL of the person's photo
 *
 * Note: mass_time is intentionally omitted — not passed from n8n workflow.
 *
 * Response:
 *   { "url": "https://your-domain.com/generated/memorial/<uuid>.png" }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, date_of_interment, interment_time, location, photo_url } = body;

  if (!name || !date_of_interment) {
    return NextResponse.json(
      { error: "name and date_of_interment are required" },
      { status: 400 }
    );
  }

  // Download the photo and save locally so the image pipeline can access it
  let savedPhotoParam: string | null = null;
  if (photo_url) {
    try {
      const res = await fetch(photo_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";
      const ext = contentType.includes("png") ? "png"
                : contentType.includes("webp") ? "webp"
                : "jpg";

      const filename = `${crypto.randomUUID()}.${ext}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "memorial");
      await writeFile(path.join(uploadDir, filename), Buffer.from(await res.arrayBuffer()));
      savedPhotoParam = `/uploads/memorial/${filename}`;
    } catch (err) {
      console.error("[generate] photo download failed:", err);
    }
  }

  // Build the query-string the GET handler expects
  const imageUrl = new URL("/api/memorial-card/image", request.url);
  imageUrl.searchParams.set("name", name);
  imageUrl.searchParams.set("interment", date_of_interment);
  if (interment_time)  imageUrl.searchParams.set("interment_time", interment_time);
  if (location)        imageUrl.searchParams.set("location", location);
  if (savedPhotoParam) imageUrl.searchParams.set("photo", savedPhotoParam);

  // Generate the image
  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  // Save to public/generated/memorial/ and return a public URL
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const outputFilename = `${crypto.randomUUID()}.png`;
  const outputDir = path.join(process.cwd(), "public", "generated", "memorial");
  await writeFile(path.join(outputDir, outputFilename), imageBuffer);

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    url: `${origin}/generated/memorial/${outputFilename}`,
  });
}
