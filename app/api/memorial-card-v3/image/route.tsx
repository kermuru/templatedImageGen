import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { processPhoto } from "@/domain/memorial-card-v3/lib/process-photo";

export const runtime = "nodejs";

// Design space — template authored at 1536 x 1024 (3:2). Every coordinate below
// is in this space and scaled to the base image's real size, so dropping in a
// higher-resolution base needs no code change.
const DESIGN_W = 1536;
const DESIGN_H = 1024;

/**
 * Memorial Card V3 — the green watercolour / botanical layout.
 *
 * Unlike V2-center this is a TWO-COLUMN design: all type sits in the left column
 * on its own centre axis, and the portrait fills the arch on the right.
 *
 * The base image already carries the cross + laurel, "IN LOVING MEMORY",
 * "CELEBRATING THE LIFE OF / THE RECENTLY DEPARTED", both ornament dividers, the
 * three detail icons with their separator bars, the Matthew 25:21 quote, and the
 * empty arch. This route overlays only what varies per person:
 *
 *   · the departed's name
 *   · the three detail chips (date · time · location)
 *   · the portrait, composited into the arch
 *
 * ── THE COORDINATES NEED ONE VISUAL PASS ──────────────────────────────────
 * LAYOUT below was measured off the reference artwork by eye, not read from the
 * artboard, so expect to nudge a few values after the first real render. They
 * are grouped and named precisely so that is a one-line edit rather than a hunt
 * through JSX.
 */
const LAYOUT = {
  // The left column's text centre axis, and the name's box between the two
  // baked ornament dividers.
  nameCenterX: 428,
  nameTop: 452,
  nameBoxW: 690,
  nameBoxH: 112,

  // Detail row. The icons are baked into the template at these centres; text
  // sits to the right of each.
  rowCenterY: 675,
  dateTextX: 150,
  timeTextX: 400,
  placeTextX: 645,

  // Two-line chips: this is the TOP of the pair; the caption follows it in a
  // flex column, so only one y is needed.
  chipValueY: 660,

  // Portrait inside the arch, as fractions of the canvas so it tracks any
  // base-image resolution.
  photoCenterXFrac: 0.725,
  photoTopFrac: 0.075,
  photoBoxWFrac: 0.33,
  photoBoxHFrac: 0.68,
} as const;

// ── Brand ─────────────────────────────────────────────────────────────────
/** The name's muted gold, matching the baked ornaments. */
const GOLD = "#B98441";
/** Near-black with a green cast, so detail text belongs to the same family as the icons. */
const INK = "#1F2D24";
/** Captions ("AT RENAISSANCE PARK") — deliberately quieter than the value above. */
const MUTED = "#5A6B60";

function fontFile(family: string, dir: string, file: string): Buffer {
  return readFileSync(
    path.join(process.cwd(), "node_modules", "@expo-google-fonts", family, dir, file)
  );
}
// Bodoni Moda — the departed's name (the thin/tall serif the artwork uses).
function bodoni(): Buffer {
  return fontFile("bodoni-moda", "400Regular", "BodoniModa_400Regular.ttf");
}
// Montserrat — the detail chips.
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
 * Composites the portrait into the right-hand arch on top of the base template.
 *
 * Top-anchored so the head sits near the arch crown, with the lower body faded
 * out (see process-photo) so the figure dissolves into the green wave instead of
 * stopping at a hard edge.
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
    const boxW = Math.round(LAYOUT.photoBoxWFrac * W);
    const boxH = Math.round(LAYOUT.photoBoxHFrac * H);
    const centerX = Math.round(LAYOUT.photoCenterXFrac * W);
    const topY = Math.round(LAYOUT.photoTopFrac * H);

    // Natural colour, unlike V2-center which desaturates — the reference artwork
    // keeps the portrait in colour against the green.
    const { buffer, width, subjectCenterX } = await processPhoto(photoPath, boxW, boxH);

    // Align the SUBJECT to the arch, not the image frame. People are rarely
    // centred in their own photo, so centring by width/2 leaves them off to one
    // side of the arch even though the image itself is centred. subjectCenterX
    // falls back to width/2 when the subject cannot be identified, which is the
    // old behaviour.
    let left = centerX - Math.round(subjectCenterX);

    // Keep the photo on the canvas whatever the correction asked for.
    left = Math.max(-Math.round(width * 0.15), Math.min(W - Math.round(width * 0.85), left));

    layers.push({ input: buffer, top: topY, left });
  }

  const composited = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 246, g: 247, b: 243 } },
  })
    .composite(layers)
    .flatten({ background: { r: 246, g: 247, b: 243 } })
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
  const photoParam = sp.get("photo") ?? "";
  // Venue is a parameter rather than baked, so another chapel needs no new
  // template. Defaults reproduce the reference artwork.
  const place = sp.get("location") ?? "RENAISSANCE PARK";
  const placeSub = sp.get("location_sub") ?? "PARK AND CHAPELS";
  const timeCaption = sp.get("time_caption") ?? "AT RENAISSANCE PARK";

  const pngBase = path.join(process.cwd(), "public", "base", "memorial-card-v3-bg.png");
  const basePath = existsSync(pngBase)
    ? pngBase
    : path.join(process.cwd(), "public", "base", "memorial-card-v3-bg.jpg");

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

  // ── Name: always ONE line, shrink-to-fit the left column. ──────────────────
  // Wrapping would collide with the ornament below it, so a long name shrinks
  // instead of breaking.
  const NAME_MAX = 92;
  const NAME_MIN = 20;
  // Bodoni Moda's UPPERCASE advance averages ≈ 0.66em; the earlier 0.52 was a
  // mixed-case figure and these names render in caps. Because the fit size scales
  // inversely with length, understating the em did NOT just affect long names —
  // it made the rendered width plateau at ~876 px for every name past ~11
  // characters, i.e. a constant ~186 px overflow that shrink-to-fit could never
  // close. nowrap keeps it off the rows below, but it still ran past the box.
  const AVG_CHAR_EM = 0.66;        // Bodoni Moda uppercase average advance width

  const fitSize = Math.floor(LAYOUT.nameBoxW / (Math.max(fullName.length, 1) * AVG_CHAR_EM));
  const nameSize = Math.round(Math.max(NAME_MIN, Math.min(NAME_MAX, fitSize)) * sx);

  const valueSize = Math.round(16 * sx);
  const captionSize = Math.round(11 * sx);

  const nameStyle = {
    display: "flex",
    fontFamily: "Bodoni, serif",
    fontWeight: 400,
    fontSize: `${nameSize}px`,
    color: GOLD,
    lineHeight: 1.05,
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
  } as const;

  const valueStyle = {
    display: "flex",
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 700,
    fontSize: `${valueSize}px`,
    color: INK,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  } as const;

  const captionStyle = {
    display: "flex",
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 600,
    fontSize: `${captionSize}px`,
    color: MUTED,
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  } as const;

  const bgStyle = bgDataUri
    ? {
        backgroundImage: `url(${bgDataUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundColor: "#f6f7f3" };

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
        {/* ── Departed name — centred on the left column's own axis, sitting
             between the two baked ornament dividers. ── */}
        <div
          style={{
            position: "absolute",
            left: `${(LAYOUT.nameCenterX - LAYOUT.nameBoxW / 2) * sx}px`,
            top: `${LAYOUT.nameTop * sy}px`,
            width: `${LAYOUT.nameBoxW * sx}px`,
            height: `${LAYOUT.nameBoxH * sy}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={nameStyle}>{fullName || "—"}</div>
        </div>

        {/* ── Date — one line, vertically centred on the icon row. ── */}
        {dateOfInterment && (
          <div
            style={{
              position: "absolute",
              left: `${LAYOUT.dateTextX * sx}px`,
              top: `${(LAYOUT.rowCenterY - 8) * sy}px`,
              ...valueStyle,
            }}
          >
            {formatIntermentDate(dateOfInterment)}
          </div>
        )}

        {/* ── Time — value over caption, right of the clock icon. ── */}
        {time && (
          <div
            style={{
              position: "absolute",
              left: `${LAYOUT.timeTextX * sx}px`,
              top: `${LAYOUT.chipValueY * sy}px`,
              display: "flex",
              flexDirection: "column",
              gap: `${2 * sy}px`,
            }}
          >
            <div style={valueStyle}>{time}</div>
            {timeCaption && <div style={captionStyle}>{timeCaption}</div>}
          </div>
        )}

        {/* ── Location — value over caption, right of the pin icon. ── */}
        {place && (
          <div
            style={{
              position: "absolute",
              left: `${LAYOUT.placeTextX * sx}px`,
              top: `${LAYOUT.chipValueY * sy}px`,
              display: "flex",
              flexDirection: "column",
              gap: `${2 * sy}px`,
            }}
          >
            <div style={valueStyle}>{place}</div>
            {placeSub && <div style={captionStyle}>{placeSub}</div>}
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
