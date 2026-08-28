import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { processPhoto } from "@/domain/memorial-card-v2/lib/process-photo";

export const runtime = "nodejs";

// Design space — the template is authored at 1536 x 1024 (3:2). All coordinates
// below are expressed in this space and scaled to the base image's real size.
const DESIGN_W = 1536;
const DESIGN_H = 1024;

// ── Brand ─────────────────────────────────────────────────────────────────
const GOLD = "#B98441";
const BLACK = "#000000";
const MUTED = "#555555";

function fontFile(family: string, dir: string, file: string): Buffer {
  return readFileSync(
    path.join(process.cwd(), "node_modules", "@expo-google-fonts", family, dir, file)
  );
}

// Bodoni Moda — the departed's name ("San Juan Pedro"). Regular weight for the
// thin, tall, high-contrast look of the reference.
function bodoni(): Buffer {
  return fontFile("bodoni-moda", "400Regular", "BodoniModa_400Regular.ttf");
}
// Montserrat — date / time / supporting details
function montserrat(weight: 600 | 700): Buffer {
  return weight === 700
    ? fontFile("montserrat", "700Bold", "Montserrat_700Bold.ttf")
    : fontFile("montserrat", "600SemiBold", "Montserrat_600SemiBold.ttf");
}

function formatIntermentDate(dateStr: string): string {
  // ISO (YYYY-MM-DD) needs T00:00:00 so UTC doesn't shift the day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  return `${day} ${month} ${date.getFullYear()}`;
}

/**
 * Composites the person photo (bottom-anchored inside the left arch, edges faded)
 * onto the V2 base template using sharp.
 */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Extracts the bottom band of the base template (the flowing white curtain /
 * fabric) and feathers its top edge to transparent, so it can be re-drawn ON TOP
 * of the figure — making the person appear to stand *behind* the curtain.
 */
async function buildCurtainBand(
  baseBuf: Buffer,
  W: number,
  bandTop: number,
  bandH: number
): Promise<Buffer> {
  const { data, info } = await sharp(baseBuf)
    .extract({ left: 0, top: bandTop, width: W, height: bandH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = 4;
  const featherH = Math.round(info.height * 0.6); // top 60% fades in

  for (let y = 0; y < info.height; y++) {
    const a = y < featherH ? smoothstep(y / featherH) : 1;
    if (a >= 1) continue;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

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
  let baseResized: Buffer | null = null;

  if (hasBase) {
    baseResized = await sharp(basePath)
      .resize(W, H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
    layers.push({ input: baseResized, top: 0, left: 0 });
  }

  if (hasPhoto && photoPath) {
    // The figure fills the left arch: head near the arch top, feet at the bottom.
    // Height drives the scale (portrait cutout); width is capped for safety.
    const boxW = Math.round(0.46 * W);
    const boxH = Math.round(0.87 * H);
    // Arch centre (design x ≈ 0.29·W).
    const archCenterX = Math.round(0.29 * W);

    const { buffer, width, height, subjectCenterX } = await processPhoto(photoPath, boxW, boxH, {
      grayscale: true,
    });

    // Bottom-anchored to the image bottom.
    // Align the SUBJECT to the arch, not the image frame. People are rarely
    // centred in their own photo, so centring by width/2 leaves them off to one
    // side of the arch even though the image itself is centred. subjectCenterX
    // falls back to width/2 when the subject cannot be identified, which is the
    // old behaviour — so a well-centred portrait renders exactly as before.
    let left = archCenterX - Math.round(subjectCenterX);

    // Keep the photo on the canvas whatever the correction asked for.
    left = Math.max(-Math.round(width * 0.15), Math.min(W - Math.round(width * 0.85), left));
    const top = H - height;
    layers.push({ input: buffer, top, left });

    // Re-draw the template's bottom curtain over the figure's lower half so the
    // person blends *under* the fabric. Feathered top edge = seamless.
    if (baseResized) {
      const bandTop = Math.round(0.74 * H);
      const bandH = H - bandTop;
      const band = await buildCurtainBand(baseResized, W, bandTop, bandH);
      layers.push({ input: band, top: bandTop, left: 0 });
    }
  }

  const composited = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(layers)
    .flatten({ background: { r: 250, g: 250, b: 250 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  // Uppercased here, not via CSS textTransform, for two reasons: Satori (next/og)
  // supports only a subset of CSS, and the name-fitting maths below reads
  // fullName.length — it must measure the same string that actually gets drawn.
  // AVG_CHAR_EM is an UPPERCASE advance width, so mixed-case input would be
  // mis-sized even when it rendered correctly.
  const fullName = (sp.get("name") ?? "").toUpperCase();
  const dateOfInterment = sp.get("interment") ?? "";
  const massTime = sp.get("mass_time") ?? "";
  const intermentTime = sp.get("interment_time") ?? "";
  const location = sp.get("location") ?? "Renaissance Park";
  const photoParam = sp.get("photo") ?? "";

  const basePath = existsSync(path.join(process.cwd(), "public", "base", "memorial-card-v2-bg.png"))
    ? path.join(process.cwd(), "public", "base", "memorial-card-v2-bg.png")
    : path.join(process.cwd(), "public", "base", "memorial-card-v2-bg.jpg");

  // Resolve real base dimensions (fall back to the design size).
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
  const sx = W / DESIGN_W; // horizontal scale
  const sy = H / DESIGN_H; // vertical scale

  const resolvedPhotoPath =
    photoParam.startsWith("/uploads/")
      ? path.join(process.cwd(), "public", photoParam)
      : path.isAbsolute(photoParam) && existsSync(photoParam)
      ? photoParam
      : null;

  const bgDataUri = await buildBackground(basePath, resolvedPhotoPath, W, H);

  const time = massTime || intermentTime;

  // Fonts
  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [
    { name: "Bodoni", data: bodoni(), weight: 400, style: "normal" },
    { name: "Montserrat", data: montserrat(600), weight: 600, style: "normal" },
    { name: "Montserrat", data: montserrat(700), weight: 700, style: "normal" },
  ];

  // ── Name: size-to-fit the right panel dynamically ──────────────────────────
  // Short/medium names render on one line (capped at NAME_MAX). Long names
  // (> ONE_LINE_MAX_CHARS, with a splittable surname) drop the LAST word onto a
  // second line; the font is sized to the longer of the two lines and capped at
  // NAME_MAX_2 so both lines stay inside the box height.
  // Bodoni Moda's UPPERCASE advance averages ≈ 0.66em. The earlier 0.52 was a
  // mixed-case figure, and since these names render in caps it under-measured
  // them by a quarter — "JUAN DELA CRUZ" was sized to 97px, estimated at 706px
  // against a 708px box, and actually drew ~896px. With no nowrap it wrapped and
  // the second line landed on top of the date/time chips. Both were fixed:
  // a truthful em here, and nowrap on each line below.
  const NAME_BOX_W = 708;          // design px — the name box width
  const NAME_MAX = 108;            // design px — one-line cap (taller, like the reference)
  const NAME_MAX_2 = 64;           // design px — two-line cap (fits box height after scaleY)
  const NAME_MIN = 26;             // design px — floor
  const AVG_CHAR_EM = 0.66;        // Bodoni Moda uppercase average advance width
  const ONE_LINE_MAX_CHARS = 20;   // beyond this, drop the surname to line 2

  const nameWords = fullName.trim().split(/\s+/).filter(Boolean);
  const twoLineName = fullName.length > ONE_LINE_MAX_CHARS && nameWords.length >= 2;
  const nameLine1 = twoLineName ? nameWords.slice(0, -1).join(" ") : fullName;
  const nameLine2 = twoLineName ? nameWords[nameWords.length - 1] : "";

  const longestLen = twoLineName
    ? Math.max(nameLine1.length, nameLine2.length)
    : Math.max(fullName.length, 1);
  const fitSize = Math.floor(NAME_BOX_W / (longestLen * AVG_CHAR_EM));
  const nameMaxForLines = twoLineName ? NAME_MAX_2 : NAME_MAX;
  const nameSize = Math.round(
    Math.max(NAME_MIN, Math.min(nameMaxForLines, fitSize)) * sx
  );
  const dateSize = Math.round(26 * sx);
  const timeSize = Math.round(26 * sx);
  const locSize = Math.round(17 * sx);

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
        {/* ── Departed name (Bodoni Moda, gold) — centered on the right panel ── */}
        <div
          style={{
            position: "absolute",
            // Right panel — centered over the RENAISSANCE logo (design center x ≈ 1112).
            // Sits in the gap between the laurel divider (~485) and the date row (~640).
            left: `${758 * sx}px`,
            top: `${482 * sy}px`,
            width: `${708 * sx}px`,
            height: `${156 * sy}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: "Bodoni, serif",
              fontWeight: 400,
              fontSize: `${nameSize}px`,
              color: GOLD,
              lineHeight: 1.05,
              letterSpacing: "0.01em",
              // Never wrap: a second line here would overrun the fixed 156px box
              // and collide with the chips below. Long names get their own second
              // line via twoLineName instead, which the box is sized for.
              whiteSpace: "nowrap",
              // scaleY keeps the height; scaleX condenses slightly to thin the stems.
              transform: "scaleX(0.92) scaleY(1.14)",
              transformOrigin: "center",
            }}
          >
            {nameLine1 || "—"}
          </div>
          {twoLineName && (
            <div
              style={{
                display: "flex",
                fontFamily: "Bodoni, serif",
                fontWeight: 500,
                fontSize: `${nameSize}px`,
                color: GOLD,
                lineHeight: 1.05,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {nameLine2}
            </div>
          )}
        </div>

        {/* ── Date (Montserrat bold) — right of the calendar icon ── */}
        {dateOfInterment && (
          <div
            style={{
              position: "absolute",
              left: `${980 * sx}px`,
              top: `${648 * sy}px`,
              display: "flex",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              fontSize: `${dateSize}px`,
              color: BLACK,
              letterSpacing: "0.05em",
            }}
          >
            {formatIntermentDate(dateOfInterment)}
          </div>
        )}

        {/* ── Time (Montserrat bold) — right of the clock icon ── */}
        {time && (
          <div
            style={{
              position: "absolute",
              left: `${980 * sx}px`,
              top: `${723 * sy}px`,
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

        {/* ── Location (Montserrat, muted) — below the time ── */}
        {location && (
          <div
            style={{
              position: "absolute",
              left: `${980 * sx}px`,
              top: `${772 * sy}px`,
              display: "flex",
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 600,
              fontSize: `${locSize}px`,
              color: MUTED,
              letterSpacing: "0.09em",
            }}
          >
            {`AT ${location}`.toUpperCase()}
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
