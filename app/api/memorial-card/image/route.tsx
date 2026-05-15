import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { processPhoto } from "@/domain/memorial-card/lib/process-photo";

export const runtime = "nodejs";

const W = 1200;
const H = 630;

function loadFont(weight: 400 | 700): Buffer {
  const [dir, file] =
    weight === 700
      ? ["700Bold", "EBGaramond_700Bold.ttf"]
      : ["400Regular", "EBGaramond_400Regular.ttf"];
  return readFileSync(
    path.join(process.cwd(), "node_modules", "@expo-google-fonts", "eb-garamond", dir, file)
  );
}

function loadRobotoSlab(): Buffer {
  return readFileSync(
    path.join(
      process.cwd(),
      "node_modules",
      "@expo-google-fonts",
      "roboto-slab",
      "500Medium",
      "RobotoSlab_500Medium.ttf"
    )
  );
}

function formatIntermentDate(dateStr: string): string {
  // ISO format (YYYY-MM-DD) needs T00:00:00 to avoid UTC offset shifting the day.
  // Human-readable strings ("May 9, 2026") parse correctly on their own.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Composites the person photo (grayscale + alpha-gradient fade) onto the
 * base template using sharp.
 *
 * Uses RGBA (4 channels) throughout — more reliable than the 2-channel
 * grayscale+alpha path which sharp can misinterpret in composite().
 * Edges fade to fully transparent so the marble texture shows through.
 */
async function buildBackground(
  basePath: string,
  photoPath: string | null
): Promise<string | null> {
  if (!existsSync(basePath)) return null;

  // Resize base PNG once — kept as PNG to preserve alpha for compositing
  const baseResized = await sharp(basePath)
    .resize(W, H, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  if (!photoPath || !existsSync(photoPath)) {
    const buf = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([{ input: baseResized, top: 0, left: 0 }])
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  // Photo sized to fit centered within the left 480px panel
  const photoW = 525;
  const photoH = 525;
  const photoLeft = Math.round((480 - photoW) / 2) + 120;
  const photoTop  = Math.round((H   - photoH) / 2) - 25;

  const processedPhoto = await processPhoto(photoPath, photoW, photoH);

  // Single composite pass: white canvas → marble base → person photo
  const composited = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: baseResized, top: 0, left: 0 },
      { input: processedPhoto, top: photoTop, left: photoLeft },
    ])
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const fullName = sp.get("name") ?? "";
  const dateOfInterment = sp.get("interment") ?? "";
  const massTime = sp.get("mass_time") ?? "";
  const intermentTime = sp.get("interment_time") ?? "";
  const location = sp.get("location") ?? "Renaissance Park";
  const photoPath = sp.get("photo") ?? "";

  const basePath =
    existsSync(path.join(process.cwd(), "public", "base", "memorial-bg.png"))
      ? path.join(process.cwd(), "public", "base", "memorial-bg.png")
      : path.join(process.cwd(), "public", "base", "memorial-bg.jpg");

  const resolvedPhotoPath =
    photoPath.startsWith("/uploads/")
      ? path.join(process.cwd(), "public", photoPath)
      : path.isAbsolute(photoPath) && existsSync(photoPath)
      ? photoPath
      : null;

  // Build the composited background (base + masked person photo)
  const bgDataUri = await buildBackground(basePath, resolvedPhotoPath);

  // Fonts
  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [
    { name: "Garamond", data: loadFont(400), weight: 400, style: "normal" },
    { name: "Garamond", data: loadFont(700), weight: 700, style: "normal" },
    { name: "RobotoSlab", data: loadRobotoSlab(), weight: 500, style: "normal" },
  ];
  const fontFamily = "Garamond, serif";
  const robotoSlabFamily = "RobotoSlab, serif";

  const gold = "#b28648";
  const darkGreen = "#07372f";
  const darkText = "#000000";
  const mutedText = "#777777";

  const bgStyle = bgDataUri
    ? {
        backgroundImage: `url(${bgDataUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: "#f0ede8" };

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${W}px`,
          height: `${H}px`,
          overflow: "hidden",
          fontFamily,
          ...bgStyle,
        }}
      >
        {/* ── Text content — right side, padded below the logo ── */}
        <div
          style={{
            position: "absolute",
            right: "45px",
            // Start below the Renaissance logo already in the base image
            top: "80px",
            bottom: "30px",
            width: "600px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0px",
          }}
        >
          {/* "Shares the interment details for" */}
          <div
            style={{
              fontSize: "20px",
              color: mutedText,
              fontWeight: 400,
              fontStyle: "italic",
              letterSpacing: "0.02em",
              marginBottom: "14px",
              fontFamily,
            }}
          >
            shares the interment details for
          </div>

          {/* Full name */}
          <div
            style={{
              fontSize: fullName.length > 28 ? "52px" : "60px",
              color: "#a67c43",
              fontWeight: 500,
              textAlign: "center",
              lineHeight: "1.1",
              letterSpacing: "0.05em",
              marginBottom: "18px",
              textTransform: "uppercase",
              fontFamily: robotoSlabFamily,
            }}
          >
            {fullName || "—"}
          </div>

          {/* Date */}
          {dateOfInterment && (
            <div
              style={{
                fontSize: "30px",
                color: darkText,
                fontWeight: 700,
                letterSpacing: "0.08em",
                marginBottom: "12px",
                fontFamily,
              }}
            >
              {formatIntermentDate(dateOfInterment)}
            </div>
          )}

          {/* See you there + time */}
          {(massTime || intermentTime) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "23px",
                  color: darkGreen,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  fontFamily,
                }}
              >
                {massTime || intermentTime}&nbsp;&nbsp;at {location}
              </span>
            </div>
          )}

          {/* In Memoriam */}
          <div
            style={{
              fontSize: "17px",
              color: mutedText,
              textAlign: "center",
              letterSpacing: "0.12em",
              fontWeight: 400,
              fontStyle: "italic",
              fontFamily,
              marginTop: "20px",
            }}
          >
            IN MEMORIAM
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
    }
  );
}
