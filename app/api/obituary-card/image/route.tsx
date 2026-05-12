import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";

export const runtime = "nodejs";

const W = 2048;
const H = 1152;

const CIRCLE_D    = 736;
const CIRCLE_LEFT = 150;
const CIRCLE_TOP  = Math.round((H - CIRCLE_D) / 2) + 50;

function loadFont(weight: 400 | 700): Buffer {
  const [dir, file] =
    weight === 700
      ? ["700Bold", "EBGaramond_700Bold.ttf"]
      : ["400Regular", "EBGaramond_400Regular.ttf"];
  return readFileSync(
    path.join(process.cwd(), "node_modules", "@expo-google-fonts", "eb-garamond", dir, file)
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function buildBackground(
  basePath: string | null,
  photoPath: string | null
): Promise<string> {
  const base = basePath
    ? await sharp(basePath)
        .resize(W, H, { fit: "cover", position: "center" })
        .png()
        .toBuffer()
    : await sharp({
        create: { width: W, height: H, channels: 3, background: { r: 212, g: 183, b: 100 } },
      }).png().toBuffer();

  const layers: sharp.OverlayOptions[] = [{ input: base, top: 0, left: 0 }];

  if (photoPath && existsSync(photoPath)) {
    const r = Math.round(CIRCLE_D / 2);
    const circleMask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CIRCLE_D}" height="${CIRCLE_D}">
         <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
       </svg>`
    );
    const circularPhoto = await sharp(photoPath)
      .resize(CIRCLE_D, CIRCLE_D, { fit: "cover", position: sharp.strategy.attention })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .ensureAlpha()
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toBuffer();
    layers.push({ input: circularPhoto, top: CIRCLE_TOP, left: CIRCLE_LEFT });
  }

  // Floral decoration anchored below the person's circle
  const flowersPath = path.join(process.cwd(), "public", "base", "obituary-flowers.png");
  if (existsSync(flowersPath)) {
    const meta = await sharp(flowersPath).metadata();
    const origW = meta.width ?? 600;
    const origH = meta.height ?? 400;
    const scaledW = 840;
    const scaledH = Math.round(scaledW * origH / origW);
    const flowers = await sharp(flowersPath)
      .resize(scaledW, scaledH)
      .ensureAlpha()
      .png()
      .toBuffer();
    const flowerLeft = Math.max(0, Math.round(CIRCLE_LEFT + CIRCLE_D / 2 - scaledW / 2));
    const flowerTop  = Math.max(0, H - scaledH + 10);
    layers.push({ input: flowers, top: flowerTop, left: flowerLeft });
  }

  const composited = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(layers)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const fullName    = sp.get("name")  ?? "";
  const dateOfBirth = sp.get("dob")   ?? "";
  const dateDied    = sp.get("died")  ?? "";
  const photoPath   = sp.get("photo") ?? "";

  const pngPath = path.join(process.cwd(), "public", "base", "obituary-bg.png");
  const jpgPath = path.join(process.cwd(), "public", "base", "obituary-bg.jpg");
  const basePath = existsSync(pngPath) ? pngPath : existsSync(jpgPath) ? jpgPath : null;

  const resolvedPhotoPath = photoPath.startsWith("/uploads/")
    ? path.join(process.cwd(), "public", photoPath)
    : null;

  const bgDataUri = await buildBackground(basePath, resolvedPhotoPath);

  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [
    { name: "Garamond", data: loadFont(400), weight: 400, style: "normal" },
    { name: "Garamond", data: loadFont(700), weight: 700, style: "normal" },
  ];
  const fontFamily = "Garamond, serif";

  const teal = "#07372f";
  const hasDate = dateOfBirth || dateDied;
  const nameFontSize =
    fullName.length <= 14 ? 112 :
    fullName.length <= 20 ? 96 :
    fullName.length <= 26 ? 80 : 64;

  const dateLabel = [
    dateOfBirth ? formatDate(dateOfBirth) : "",
    dateOfBirth && dateDied ? "   –   " : "",
    dateDied ? formatDate(dateDied) : "",
  ].join("");

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${W}px`,
          height: `${H}px`,
          overflow: "hidden",
          backgroundImage: `url(${bgDataUri})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily,
        }}
      >
        {/* Name — below the base image's "IN LOVING MEMORY OF" */}
        <div
          style={{
            position: "absolute",
            left: "1000px",
            right: "60px",
            top: "440px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "flex", fontSize: `${nameFontSize}px`, color: teal, fontWeight: 700, lineHeight: "1.05", letterSpacing: "0.06em", fontFamily, textTransform: "uppercase", textAlign: "center" }}>
            {fullName || "—"}
          </div>
        </div>

        {/* Dates — below the base image's "A Life Remembered" + divider line */}
        {hasDate && (
          <div
            style={{
              position: "absolute",
              left: "1000px",
              right: "60px",
              top: "750px",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", fontSize: "38px", color: teal, fontWeight: 400, letterSpacing: "0.02em", fontFamily, textAlign: "center" }}>
              {dateLabel}
            </div>
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts }
  );
}
