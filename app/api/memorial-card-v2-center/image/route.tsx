import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { processPhoto } from "@/domain/memorial-card-v2-center/lib/process-photo";

export const runtime = "nodejs";

// Design space — template authored at 1536 x 1024 (3:2). Coordinates below are in
// this space and scaled to the base image's real size.
const DESIGN_W = 1536;
const DESIGN_H = 1024;

// ── Brand ─────────────────────────────────────────────────────────────────
const GOLD = "#B98441";
const BLACK = "#1a1a1a";

function fontFile(family: string, dir: string, file: string): Buffer {
  return readFileSync(
    path.join(process.cwd(), "node_modules", "@expo-google-fonts", family, dir, file)
  );
}
// Bodoni Moda — the departed's name (thin/tall look).
function bodoni(): Buffer {
  return fontFile("bodoni-moda", "400Regular", "BodoniModa_400Regular.ttf");
}
// Montserrat — date / time details.
function montserrat(weight: 600 | 700): Buffer {
  return weight === 700
    ? fontFile("montserrat", "700Bold", "Montserrat_700Bold.ttf")
    : fontFile("montserrat", "600SemiBold", "Montserrat_600SemiBold.ttf");
}

function formatIntermentDate(dateStr: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  return `${day} ${month} ${date.getFullYear()}`;
}

/**
 * Composites the person photo centered inside the arch (top-anchored, edges
 * faded) onto the base template.
 */
async function buildBackground(
  basePath: string,
  photoPath: string | null,
  W: number,
  H: number
): Promise<string | null> {
  const hasBase = existsSync(basePath);
  const hasPhoto = !!photoPath && existsSync(photoPath);
  if (!hasBase && !hasPhoto) return null;

  const layers: sharp.OverlayOptions[] = [];

  if (hasBase) {
    const baseResized = await sharp(basePath)
      .resize(W, H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
    layers.push({ input: baseResized, top: 0, left: 0 });
  }

  if (hasPhoto && photoPath) {
    // Centered in the arch, TOP-anchored (head near the arch top).
    const boxW = Math.round(0.34 * W);
    const boxH = Math.round(0.58 * H);
    const centerX = Math.round(0.5 * W);
    const topY = Math.round(0.03 * H);

    const { buffer, width, height, subjectCenterX } = await processPhoto(photoPath, boxW, boxH, {
      grayscale: true,
    });

    // Align the SUBJECT to the arch, not the image frame. People are rarely
    // centred in their own photo, so centring by width/2 leaves them off to one
    // side of the arch even though the image itself is centred. subjectCenterX
    // falls back to width/2 when the subject cannot be identified, which is the
    // old behaviour — so a well-centred portrait renders exactly as before.
    let left = centerX - Math.round(subjectCenterX);

    // Keep the photo on the canvas whatever the correction asked for.
    left = Math.max(-Math.round(width * 0.15), Math.min(W - Math.round(width * 0.85), left));
    layers.push({ input: buffer, top: topY, left });
    void height;
  }

  const composited = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .composite(layers)
    .flatten({ background: { r: 250, g: 250, b: 250 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const fullName = sp.get("name") ?? "";
  const dateOfInterment = sp.get("interment") ?? "";
  const massTime = sp.get("mass_time") ?? "";
  const intermentTime = sp.get("interment_time") ?? "";
  const photoParam = sp.get("photo") ?? "";

  const basePath = existsSync(path.join(process.cwd(), "public", "base", "memorial-card-v2-center-bg.png"))
    ? path.join(process.cwd(), "public", "base", "memorial-card-v2-center-bg.png")
    : path.join(process.cwd(), "public", "base", "memorial-card-v2-center-bg.jpg");

  let W = DESIGN_W;
  let H = DESIGN_H;
  if (existsSync(basePath)) {
    try {
      const meta = await sharp(basePath).metadata();
      if (meta.width && meta.height) {
        W = meta.width;
        H = meta.height;
      }
    } catch {
      /* keep design defaults */
    }
  }
  const sx = W / DESIGN_W;
  const sy = H / DESIGN_H;

  const resolvedPhotoPath =
    photoParam.startsWith("/uploads/")
      ? path.join(process.cwd(), "public", photoParam)
      : path.isAbsolute(photoParam) && existsSync(photoParam)
      ? photoParam
      : null;

  const bgDataUri = await buildBackground(basePath, resolvedPhotoPath, W, H);

  const time = massTime || intermentTime;

  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [
    { name: "Bodoni", data: bodoni(), weight: 400, style: "normal" },
    { name: "Montserrat", data: montserrat(600), weight: 600, style: "normal" },
    { name: "Montserrat", data: montserrat(700), weight: 700, style: "normal" },
  ];

  // ── Name: always ONE line, shrink-to-fit the panel width. ───────────────────
  const NAME_BOX_W = 1000;         // design px — centered name width
  const NAME_MAX = 104;            // cap for short names
  const NAME_MIN = 22;             // floor (long names shrink to here, no wrapping)
  // Bodoni Moda's UPPERCASE advance averages ≈ 0.66em; the earlier 0.52 was a
  // mixed-case figure and these names render in caps. Because the fit size scales
  // inversely with length, understating the em did NOT just affect long names —
  // it made the rendered width plateau at ~1269 px for every name past ~11
  // characters, i.e. a constant ~269 px overflow that shrink-to-fit could never
  // close. nowrap keeps it off the rows below, but it still ran past the box.
  const AVG_CHAR_EM = 0.66;        // Bodoni Moda uppercase average advance width

  const fitSize = Math.floor(NAME_BOX_W / (Math.max(fullName.length, 1) * AVG_CHAR_EM));
  const nameSize = Math.round(Math.max(NAME_MIN, Math.min(NAME_MAX, fitSize)) * sx);

  // Match the baked bold "RENAISSANCE PARK" reference (~17px).
  const dateSize = Math.round(17 * sx);
  const timeSize = Math.round(17 * sx);

  const nameStyle = {
    display: "flex",
    fontFamily: "Bodoni, serif",
    fontWeight: 400,
    fontSize: `${nameSize}px`,
    color: GOLD,
    lineHeight: 1.05,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    transform: "scaleX(0.92) scaleY(1.14)",
    transformOrigin: "center",
  } as const;

  const bgStyle = bgDataUri
    ? {
        backgroundImage: `url(${bgDataUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: "#fafafa" };

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${W}px`,
          height: `${H}px`,
          overflow: "hidden",
          ...bgStyle,
        }}
      >
        {/* ── Departed name (Bodoni Moda, gold) — centered on the baked text axis
             (CELEBRATING / quote sit at design x ≈ 803, not the geometric 768). ── */}
        <div
          style={{
            position: "absolute",
            left: `${303 * sx}px`,
            top: `${672 * sy}px`,
            width: `${1000 * sx}px`,
            height: `${118 * sy}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={nameStyle}>{fullName || "—"}</div>
        </div>

        {/* ── Date (Montserrat bold) — right of the calendar icon ── */}
        {dateOfInterment && (
          <div
            style={{
              position: "absolute",
              // Right of the calendar icon (icon center x≈433), centered on the row.
              left: `${478 * sx}px`,
              top: `${858 * sy}px`,
              display: "flex",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              fontSize: `${dateSize}px`,
              color: BLACK,
              letterSpacing: "0.04em",
            }}
          >
            {formatIntermentDate(dateOfInterment)}
          </div>
        )}

        {/* ── Time (Montserrat bold) — above the baked "AT RENAISSANCE PARK" ── */}
        {time && (
          <div
            style={{
              position: "absolute",
              // Bold top line above the baked "AT RENAISSANCE PARK" (left x≈773).
              left: `${773 * sx}px`,
              top: `${849 * sy}px`,
              display: "flex",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              fontSize: `${timeSize}px`,
              color: BLACK,
              letterSpacing: "0.03em",
            }}
          >
            {time}
          </div>
        )}
      </div>
    ),
    {
      width: W,
      height: H,
      fonts,
    }
  );
}
