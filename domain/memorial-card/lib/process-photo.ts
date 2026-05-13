import sharp from "sharp";

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Converts a photo to grayscale with smoothstep alpha fades on all four edges.
 * Returns a PNG Buffer with alpha channel (transparent where faded).
 */
export async function processPhoto(
  photoPath: string,
  width: number,
  height: number
): Promise<Buffer> {
  const { data, info } = await sharp(photoPath)
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = 4;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * ch;

      // Grayscale (ITU-R BT.601)
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;

      if (data[i + 3] > 0) {
        let fade = 0;

        // Right white fade: 80 % → 100 %
        if (x / info.width > 0.80)
          fade = Math.max(fade, smoothstep((x / info.width - 0.80) / 0.20));

        // Bottom white fade: 40 % → 100 %
        if (y / info.height > 0.40)
          fade = Math.max(fade, smoothstep((y / info.height - 0.40) / 0.60));

        if (fade > 0) {
          data[i]     = Math.round(data[i]     + (255 - data[i])     * fade);
          data[i + 1] = Math.round(data[i + 1] + (255 - data[i + 1]) * fade);
          data[i + 2] = Math.round(data[i + 2] + (255 - data[i + 2]) * fade);
        }
      }
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: ch },
  })
    .png()
    .toBuffer();
}
