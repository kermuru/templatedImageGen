import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { processPhoto } from "@/domain/memorial-card/lib/process-photo";

export const runtime = "nodejs";

const PANEL_W = 480;
const PANEL_H = 630;
const PHOTO_W = 400;
const PHOTO_H = 520;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const photoPath = sp.get("photo") ?? "";

  const resolvedPhotoPath = photoPath.startsWith("/uploads/")
    ? path.join(process.cwd(), "public", photoPath)
    : null;

  if (!resolvedPhotoPath || !existsSync(resolvedPhotoPath)) {
    return new NextResponse("No photo provided", { status: 400 });
  }

  const processedPhoto = await processPhoto(resolvedPhotoPath, PHOTO_W, PHOTO_H);

  const photoLeft = Math.round((PANEL_W - PHOTO_W) / 2);
  const photoTop  = Math.round((PANEL_H - PHOTO_H) / 2);

  const bg = await sharp({
    create: { width: PANEL_W, height: PANEL_H, channels: 3, background: { r: 240, g: 237, b: 232 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();

  const preview = await sharp(bg)
    .composite([{ input: processedPhoto, top: photoTop, left: photoLeft }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return new NextResponse(new Uint8Array(preview), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
}
