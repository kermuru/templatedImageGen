import sharp from "sharp";

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export type ProcessedPhoto = {
  buffer: Buffer;
  width: number;
  height: number;
  /**
   * Horizontal centre of the SUBJECT in the processed image, in its own pixels.
   *
   * Not the same as width/2: people are rarely centred in their own photo, so
   * aligning the frame's middle to the arch leaves the person off to one side.
   * The caller aligns THIS to the arch instead. Falls back to width/2 when the
   * subject cannot be identified (see below).
   */
  subjectCenterX: number;
};

/**
 * Memorial Card V2 (center) photo processing.
 *
 * The figure sits inside the central arch, top-anchored (head near the arch top).
 * We trim any transparent / uniform padding so the subject fills the frame, then
 * fade the edges so it melts into the watercolor + foliage — a longer BOTTOM fade
 * (the figure dissolves toward the name), light side fades, crisp top.
 *
 * Keeps natural colour by default; pass `{ grayscale: true }` to desaturate.
 */
export async function processPhoto(
  photoPath: string,
  boxW: number,
  boxH: number,
  opts: { grayscale?: boolean } = {}
): Promise<ProcessedPhoto> {
  const grayscale = opts.grayscale ?? false;

  let pipeline = sharp(photoPath).ensureAlpha();
  try {
    pipeline = pipeline.trim({ threshold: 10 });
  } catch {
    pipeline = sharp(photoPath).ensureAlpha();
  }

  let raw;
  try {
    raw = await pipeline
      .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    raw = await sharp(photoPath)
      .ensureAlpha()
      .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  const { data, info } = raw;

  const ch = 4;

  // ── Where is the subject, horizontally? ────────────────────────────────────
  // Centre of mass of the opaque pixels, measured BEFORE the edge fade below —
  // the fade lowers alpha near the borders, which would drag the centroid back
  // toward the middle and defeat the point.
  //
  // A fully opaque photo (no background removal) has no subject/background
  // distinction to find, so this degrades to the frame's middle, i.e. exactly
  // the old behaviour.
  let subjectCenterX = info.width / 2;
  {
    const OPAQUE = 32; // ignore near-transparent halo left by cut-out tools
    let weightedX = 0;
    let total = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * ch + 3] > OPAQUE) {
          weightedX += x;
          total++;
        }
      }
    }

    // Require a real subject: a handful of stray pixels would give a meaningless
    // centroid, and a fully-opaque image gives width/2 anyway.
    const coverage = total / (info.width * info.height);
    if (total > 0 && coverage > 0.02 && coverage < 0.995) {
      const measured = weightedX / total;
      // Clamp the correction. A wild centroid (busy background that survived
      // removal, say) must never fling the portrait out of the arch — at worst
      // it falls back toward centre.
      const maxShift = info.width * 0.25;
      const delta = Math.max(-maxShift, Math.min(maxShift, measured - info.width / 2));
      subjectCenterX = info.width / 2 + delta;
    }
  }

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;

      if (grayscale) {
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      if (data[i + 3] > 0) {
        const nx = x / info.width;
        const ny = y / info.height;
        const keepLeft   = nx < 0.12 ? smoothstep(nx / 0.12) : 1;
        const keepRight  = nx > 0.88 ? smoothstep((1 - nx) / 0.12) : 1;
        // Very gradual bottom fade — the figure dissolves smoothly into the
        // foliage / name area (starts high so the white barong melts away).
        const keepBottom = ny > 0.42 ? smoothstep((1 - ny) / 0.58) : 1;
        const fade = 1 - keepLeft * keepRight * keepBottom;

        if (fade > 0) {
          // Fade the ALPHA (not the colour) so edges become transparent and the
          // cream template shows through — no white block.
          data[i + 3] = Math.round(data[i + 3] * (1 - fade));
        }
      }
    }
  }

  const buffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  })
    .png()
    .toBuffer();

  return {
    buffer,
    width: info.width,
    height: info.height,
    subjectCenterX,
  };
}
