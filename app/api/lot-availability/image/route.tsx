import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";

export const runtime = "nodejs";

const W = 1080;
const H = 1350;

function loadFont(): Buffer {
  return readFileSync(
    path.join(
      process.cwd(),
      "node_modules",
      "@expo-google-fonts",
      "bebas-neue",
      "400Regular",
      "BebasNeue_400Regular.ttf"
    )
  );
}

function loadMontserrat(): Buffer {
  return readFileSync(
    path.join(
      process.cwd(),
      "node_modules",
      "@expo-google-fonts",
      "montserrat",
      "400Regular",
      "Montserrat_400Regular.ttf"
    )
  );
}

async function buildBackground(basePath: string): Promise<string | null> {
  if (!existsSync(basePath)) return null;
  const buf = await sharp(basePath)
    .resize(W, H, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const areaNo         = sp.get("area_no")         ?? "";
  const blockNo        = sp.get("block_no")        ?? "";
  const lotType        = sp.get("lot_type")        ?? "";
  const availableCount = sp.get("available_count") ?? "";

  const basePath = path.join(process.cwd(), "public", "base", "lot-availability-bg.jpg");
  const bgDataUri = await buildBackground(basePath);

  const bebasFont = loadFont();
  const montserratFont = loadMontserrat();
  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [
    { name: "Bebas", data: bebasFont, weight: 400, style: "normal" },
    { name: "Montserrat", data: montserratFont, weight: 400, style: "normal" },
  ];
  const fontFamily = "Bebas, sans-serif";
  const montserratFamily = "Montserrat, sans-serif";

  const white = "#ffffff";

  const bgStyle = bgDataUri
    ? { backgroundImage: `url(${bgDataUri})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundColor: "#0d3320" };

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
        {/* Area number — fills the gap after "AREA" in the base template */}
        <div
          style={{
            position: "absolute",
            top: "335px",
            left: "467px",
            display: "flex",
            fontSize: "96px",
            color: white,
            fontFamily,
            letterSpacing: "4px",
          }}
        >
          {areaNo}
        </div>

        {/* Block number — fills the gap after "BLOCK" in the base template */}
        <div
          style={{
            position: "absolute",
            top: "335px",
            left: "720px",
            display: "flex",
            fontSize: "96px",
            color: white,
            fontFamily,
            letterSpacing: "4px",
          }}
        >
          {blockNo}
        </div>

        {/* Lot type */}
        <div
          style={{
            position: "absolute",
            top: "450px",
            left: "40px",
            right: "0",
            display: "flex",
            justifyContent: "center",
            fontSize: "50px",
            color: white,
            fontFamily: montserratFamily,
            letterSpacing: "6px",
          }}
        >
          {lotType}
        </div>

        {/* Large available count — centered */}
        <div
          style={{
            position: "absolute",
            top: "550px",
            left: "0",
            right: "0",
            display: "flex",
            justifyContent: "center",
            fontSize: "260px",
            color: "#C1A200",
            fontFamily,
            lineHeight: "1",
          }}
        >
          {availableCount}
        </div>
      </div>
    ),
    { width: W, height: H, fonts }
  );
}
