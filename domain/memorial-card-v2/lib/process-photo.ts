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
 * Memorial Card V2 photo processing.
 *
 * The V2 template places a full-figure portrait inside the left arch, so we fit
 * the photo *inside* the box (preserving aspect, no letterbox padding) and return
 * its actual rendered size — the caller bottom-anchors it so the feet meet the
 * base template's fabric.
 *
 * Edges are faded (left / right / bottom) so the figure melts into the watercolor
 * background; the top stays crisp to keep the face sharp. Unlike memorial-card V1,
 * the photo keeps its natural colour by default (the V2 sample is colour); pass
 * `{ grayscale: true }` to desaturate.
 */
export async function processPhoto(
  photoPath: string,
  boxW: number,
  boxH: number,
  opts: { grayscale?: boolean } = {}
): Promise<ProcessedPhoto> {
  const grayscale = opts.grayscale ?? false;

  // Cutouts often ship with wide transparent / uniform padding around the figure,
  // which makes fit:"inside" shrink the subject. Trim that padding first so the
  // figure fills the box; fall back to the untrimmed image if trim fails.
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
    // If the trimmed pipeline threw at resize, retry from the original image.
    raw = await sharp(photoPath)
      .ensureAlpha()
      .resize(boxW, boxH, { fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  const { data, info } = raw;

  const ch = 4;

  // ── Where is the subject, horizontally? ──────────────────────────────────
  // Centre of mass of the opaque pixels, measured BEFORE the edge fade below —
  // the fade touches the border pixels, which would drag the centroid back
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
        // Multiplicative keep-amounts — corners blend naturally instead of seaming.
        const nx = x / info.width;
        const ny = y / info.height;
        const keepLeft   = nx < 0.08 ? smoothstep(nx / 0.08) : 1;
        const keepRight  = nx > 0.92 ? smoothstep((1 - nx) / 0.08) : 1;
        const keepBottom = ny > 0.85 ? smoothstep((1 - ny) / 0.15) : 1;
        const fade = 1 - keepLeft * keepRight * keepBottom;

        if (fade > 0) {
          data[i]     = Math.round(data[i]     + (255 - data[i])     * fade);
          data[i + 1] = Math.round(data[i + 1] + (255 - data[i + 1]) * fade);
          data[i + 2] = Math.round(data[i + 2] + (255 - data[i + 2]) * fade);
        }
      }
    }
  }

  const buffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  })
    .png()
    .toBuffer();

  return { buffer, width: info.width, height: info.height, subjectCenterX };
}
