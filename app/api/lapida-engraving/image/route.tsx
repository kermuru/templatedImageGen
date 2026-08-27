import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";

export const runtime = "nodejs";

// 350 DPI at 23.25 × 11.5 inches — high-definition print quality
const W = 8138;
const H = 4025;

// 38% of canvas width reserved for the portrait photo (when present)
const PHOTO_W = Math.round(W * 0.38);

// Scale factor relative to the original 2048-wide design — applied to every
// hardcoded pixel value in the layout so proportions stay identical on print.
const SCALE = W / 2048;
const sc = (n: number) => Math.round(n * SCALE);

type Occupant = { name: string; dob?: string; dod?: string };

// ── Fonts ─────────────────────────────────────────────────────────────────────

function loadFont(weight: 400 | 700, style: "normal" | "italic" = "normal"): Buffer {
  const map: Record<string, [string, string]> = {
    "400-normal": ["400Regular",        "LibreBaskerville_400Regular.ttf"],
    "400-italic": ["400Regular_Italic", "LibreBaskerville_400Regular_Italic.ttf"],
    "700-normal": ["700Bold",           "LibreBaskerville_700Bold.ttf"],
    "700-italic": ["700Bold_Italic",    "LibreBaskerville_700Bold_Italic.ttf"],
  };
  const [dir, file] = map[`${weight}-${style}`] ?? map["400-normal"];
  const p = path.join(
    process.cwd(),
    "node_modules",
    "@expo-google-fonts",
    "libre-baskerville",
    dir,
    file
  );
  // Fall back to 400Regular if the requested variant doesn't exist on disk
  return existsSync(p)
    ? readFileSync(p)
    : readFileSync(
        path.join(
          process.cwd(),
          "node_modules",
          "@expo-google-fonts",
          "libre-baskerville",
          "400Regular",
          "LibreBaskerville_400Regular.ttf"
        )
      );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function formatDate(raw: string): string {
  if (!raw) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(raw + "T00:00:00")
    : new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
}

function formatLot(lotNo: string): string {
  return lotNo.split("-").join("  –  ");
}

// Scales name font-size by occupant count, max name length, and text-area width.
// Returns a base value at 2048px width — caller multiplies by SCALE.
function nameFontSize(count: number, maxLen: number, hasPhoto: boolean): number {
  let size =
    count === 1 ? 120 :
    count === 2 ? 100 :
    count === 3 ?  82 :
                   68;
  if (maxLen > 22) size = Math.round(size * 0.88);
  if (maxLen > 28) size = Math.round(size * 0.82);
  // Photo narrows text area for multi-name layouts
  if (hasPhoto && count > 2) size = Math.round(size * 0.92);
  return size;
}

// ── Background compositing (Sharp) ────────────────────────────────────────────

async function buildBackground(photoPath: string | null, gamma = 1.2): Promise<string> {
  // Black canvas
  const canvas = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  if (!photoPath || !existsSync(photoPath)) {
    const jpg = await sharp(canvas).jpeg({ quality: 95 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  }

  // Two Sharp passes on the resized photo — keeps tone correction separate from masking:
  //   alphaBuf: 1-channel remove.bg person mask (255 = person, 0 = background).
  //             ensureAlpha() makes photos without a mask fully opaque (whole image = person).
  //   grayBuf:  1-channel grayscale with normalize() — Sharp's battle-tested auto-levels
  //             stretches any input (dark, bright, flat) to full 0–255 tonal range reliably.

  const resizeOpts = { fit: "cover" as const, position: "top" as const };

  let alphaR = await sharp(photoPath)
    .resize(PHOTO_W, H, resizeOpts)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer({ resolveWithObject: true });
  let grayR = await sharp(photoPath)
    .resize(PHOTO_W, H, resizeOpts)
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let alphaBuf = alphaR.data;
  let grayBuf  = grayR.data;
  let info     = grayR.info;

  // If the person doesn't fill 82% of the panel height (headshot / bust shot with
  // transparent background), crop to their bounding box and re-render at full size.
  // This fills the panel regardless of whether Stability AI ran.
  {
    let topRow = info.height, bottomRow = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (alphaBuf[y * info.width + x] > 30) {
          if (y < topRow) topRow = y;
          if (y > bottomRow) bottomRow = y;
        }
      }
    }
    const personRows = Math.max(0, bottomRow - topRow + 1);
    if (personRows > 0 && personRows < info.height * 0.82) {
      const pad    = Math.max(12, Math.round(personRows * 0.06));
      const cTop   = Math.max(0, topRow - pad);
      const cH     = Math.min(info.height - cTop, personRows + pad * 2);
      const zoomed = await sharp(photoPath)
        .resize(PHOTO_W, H, resizeOpts)
        .extract({ left: 0, top: cTop, width: info.width, height: cH })
        .resize(PHOTO_W, H, { fit: "fill" })
        .png()
        .toBuffer();
      alphaR   = await sharp(zoomed).ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
      grayR    = await sharp(zoomed).grayscale().normalize().raw().toBuffer({ resolveWithObject: true });
      alphaBuf = alphaR.data;
      grayBuf  = grayR.data;
      info     = grayR.info;
    }
  }

  // RGBA output buffer — halftone dots composited over the black canvas
  const outBuf = Buffer.alloc(info.width * info.height * 4, 0);

  // True halftone: white anti-aliased circular dots, sized by cell luminance.
  // Dot radius scales linearly with normalized luma — normalize() already handled tone.
  const CELL = sc(2);
  for (let cellRow = 0; cellRow * CELL < info.height; cellRow++) {
    for (let cellCol = 0; cellCol * CELL < info.width; cellCol++) {
      const x0 = cellCol * CELL, y0 = cellRow * CELL;
      const x1 = Math.min(x0 + CELL, info.width);
      const y1 = Math.min(y0 + CELL, info.height);
      const cx = x0 + (CELL - 1) / 2;
      const cy = y0 + (CELL - 1) / 2;

      let sum = 0, cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const pi = y * info.width + x;
          if (alphaBuf[pi] > 30) { sum += grayBuf[pi]; cnt++; }
        }
      }
      const lum = cnt > 0 ? sum / cnt : 0;
      // Area-proportional halftone: the dot's white AREA equals the desired tone `fill`,
      // so perceived brightness tracks luminance faithfully (coverage == tone).
      //   gamma = 1.0 → neutral/faithful;  gamma < 1 → brighter (dark print media);
      //   gamma > 1 → darker.
      // At fill → 1 the radius (CELL·√(1/π) ≈ 0.564·CELL) overspills the cell into its
      // corners, so highlights merge to true white instead of a capped ~78% gray.
      const fill = Math.pow(lum / 255, gamma);
      const dotR = lum > 0 ? Math.sqrt(fill / Math.PI) * CELL : 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const pi = y * info.width + x;
          if (alphaBuf[pi] <= 30) continue;

          const dist      = Math.hypot(x - cx, y - cy);
          const edgeAlpha = Math.max(0, Math.min(1, dotR - dist + 0.5));
          const oi = pi * 4;
          outBuf[oi]     = 255;
          outBuf[oi + 1] = 255;
          outBuf[oi + 2] = 255;
          outBuf[oi + 3] = Math.round(edgeAlpha * 255);
        }
      }
    }
  }

  // Edge fade — left and right silhouette blends into the black canvas
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const nx = x / info.width;
      let fade = 1;
      if (nx < 0.12) fade = smoothstep(nx / 0.12);
      else if (nx > 0.85) fade = smoothstep((1 - nx) / 0.15);
      if (fade < 1) {
        const oi = (y * info.width + x) * 4;
        outBuf[oi + 3] = Math.round(outBuf[oi + 3] * fade);
      }
    }
  }

  const photoBuffer = await sharp(outBuf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const composited = await sharp(canvas)
    .composite([{ input: photoBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  return `data:image/jpeg;base64,${composited.toString("base64")}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lotNo      = sp.get("lot_no")   ?? "";
  const photoParam = sp.get("photo")    ?? "";
  const gamma      = Math.max(0.3, Math.min(2.5, parseFloat(sp.get("gamma") ?? "1.2")));

  let occupants: Occupant[] = [];
  try {
    occupants = JSON.parse(sp.get("occupants") ?? "[]");
  } catch {
    // ignore
  }
  if (!occupants.length) return new Response("occupants required", { status: 400 });

  const hasPhoto  = !!photoParam && existsSync(photoParam);
  const bgDataUri = await buildBackground(hasPhoto ? photoParam : null, gamma);

  // Layout geometry — all offsets scaled from the 2048-wide reference design
  const TEXT_LEFT = hasPhoto ? PHOTO_W + sc(64) : sc(100);
  const TEXT_W    = W - TEXT_LEFT - sc(100);
  const HALF_W    = Math.round((TEXT_W - sc(80)) / 2);

  const count    = occupants.length;
  const maxLen   = Math.max(...occupants.map((o) => o.name.length));
  const nameSize = sc(nameFontSize(count, maxLen, hasPhoto));
  const dateSize = Math.round(nameSize * 0.37);
  const tagSize  = Math.round(nameSize * 0.58);

  const white    = "#FFFFFF";
  const dimWhite = "rgba(255,255,255,0.78)";
  const ff       = "LibreBaskerville, serif";

  const fonts = [
    { name: "LibreBaskerville", data: loadFont(400, "normal"), weight: 400 as const, style: "normal" as const },
    { name: "LibreBaskerville", data: loadFont(700, "normal"), weight: 700 as const, style: "normal" as const },
    { name: "LibreBaskerville", data: loadFont(400, "italic"), weight: 400 as const, style: "italic" as const },
  ];

  // ── Occupant block ──────────────────────────────────────────────────────────
  function occupantBlock(occ: Occupant, blockW: number) {
    const dates = [
      occ.dob ? formatDate(occ.dob) : "",
      occ.dob && occ.dod ? "  •  " : "",
      occ.dod ? formatDate(occ.dod) : "",
    ].join("");

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: `${blockW}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            color: white,
            fontSize: `${nameSize}px`,
            fontWeight: 400,
            fontFamily: ff,
            textTransform: "uppercase",
            textAlign: "center",
            letterSpacing: "0.045em",
            lineHeight: "1.1",
          }}
        >
          {occ.name}
        </div>
        {dates && (
          <div
            style={{
              display: "flex",
              color: dimWhite,
              fontSize: `${dateSize}px`,
              fontWeight: 400,
              fontFamily: ff,
              marginTop: `${sc(14)}px`,
              textAlign: "center",
              letterSpacing: "0.02em",
            }}
          >
            {dates}
          </div>
        )}
      </div>
    );
  }

  // ── Names grid — layout varies by count + photo ─────────────────────────────
  //
  //  1 name              → centered single column
  //  2 names + no photo  → side by side
  //  2 names + photo     → stacked vertically
  //  3 names             → [name1 | name2] top, [name3] centered bottom
  //  4+ names            → 2-per-row grid
  //
  let namesGrid;

  if (count === 1) {
    namesGrid = (
      <div style={{ display: "flex", justifyContent: "center", width: `${TEXT_W}px` }}>
        {occupantBlock(occupants[0], TEXT_W)}
      </div>
    );
  } else if (count === 2 && !hasPhoto) {
    // Side by side
    namesGrid = (
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", width: `${TEXT_W}px` }}>
        <div style={{ display: "flex", marginRight: `${sc(80)}px` }}>
          {occupantBlock(occupants[0], HALF_W)}
        </div>
        {occupantBlock(occupants[1], HALF_W)}
      </div>
    );
  } else if (count === 2 && hasPhoto) {
    // Stacked
    namesGrid = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${TEXT_W}px` }}>
        <div style={{ display: "flex", marginBottom: `${sc(50)}px` }}>
          {occupantBlock(occupants[0], TEXT_W)}
        </div>
        {occupantBlock(occupants[1], TEXT_W)}
      </div>
    );
  } else if (count === 3) {
    namesGrid = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${TEXT_W}px` }}>
        <div style={{ display: "flex", flexDirection: "row", justifyContent: "center", width: `${TEXT_W}px`, marginBottom: `${sc(44)}px` }}>
          <div style={{ display: "flex", marginRight: `${sc(60)}px` }}>
            {occupantBlock(occupants[0], HALF_W)}
          </div>
          {occupantBlock(occupants[1], HALF_W)}
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {occupantBlock(occupants[2], HALF_W)}
        </div>
      </div>
    );
  } else {
    // 4+ names: 2-per-row
    const rows = [];
    for (let r = 0; r < occupants.length; r += 2) {
      const isLast = r + 2 >= occupants.length;
      rows.push(
        <div
          key={r}
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            width: `${TEXT_W}px`,
            marginBottom: isLast ? "0px" : `${sc(40)}px`,
          }}
        >
          <div style={{ display: "flex", marginRight: `${sc(60)}px` }}>
            {occupantBlock(occupants[r], HALF_W)}
          </div>
          <div style={{ display: "flex" }}>
            {r + 1 < occupants.length
              ? occupantBlock(occupants[r + 1], HALF_W)
              : <div style={{ display: "flex", width: `${HALF_W}px` }} />}
          </div>
        </div>
      );
    }
    namesGrid = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: `${TEXT_W}px` }}>
        {rows}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: `${W}px`,
          height: `${H}px`,
          backgroundImage: `url(${bgDataUri})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          overflow: "hidden",
          fontFamily: ff,
        }}
      >
        {/* Names + tagline — vertically centered as one block */}
        <div
          style={{
            position: "absolute",
            left: `${TEXT_LEFT}px`,
            top: 0,
            width: `${TEXT_W}px`,
            height: `${H - sc(120)}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {namesGrid}
          <div style={{ display: "flex", marginTop: `${sc(64)}px` }}>
            <span
              style={{
                color: white,
                fontSize: `${tagSize}px`,
                fontStyle: "italic",
                fontWeight: 400,
                fontFamily: ff,
                letterSpacing: "0.025em",
              }}
            >
              Forever Loved, Never Forgotten
            </span>
          </div>
        </div>

        {/* Lot number — bottom right */}
        {lotNo && (
          <div
            style={{
              position: "absolute",
              right: `${sc(68)}px`,
              bottom: `${sc(52)}px`,
              display: "flex",
            }}
          >
            <span
              style={{
                color: white,
                fontSize: `${sc(44)}px`,
                fontWeight: 400,
                fontFamily: ff,
                letterSpacing: "0.07em",
              }}
            >
              {formatLot(lotNo)}
            </span>
          </div>
        )}
      </div>
    ),
    { width: W, height: H, fonts }
  );
}
