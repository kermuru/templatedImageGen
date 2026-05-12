import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { GET } from "@/app/api/lot-availability/image/route";

export const runtime = "nodejs";

/**
 * POST /api/lot-availability/generate
 *
 * n8n webhook endpoint. Accepts JSON, generates the lot availability card,
 * uploads to Vercel Blob, and returns a public URL.
 *
 * Body fields:
 *   area_no          string|number  required
 *   block_no         string|number  required
 *   lot_type         string         required
 *   available_count  string|number  required
 *
 * Response:
 *   { "url": "https://...vercel-storage.com/lot-availability/uuid.jpg" }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, string | number>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { area_no, block_no, lot_type, available_count } = body;

  if (!area_no || !block_no || !lot_type || available_count === undefined) {
    return NextResponse.json(
      { error: "area_no, block_no, lot_type, and available_count are required" },
      { status: 400 }
    );
  }

  const imageUrl = new URL("/api/lot-availability/image", request.url);
  imageUrl.searchParams.set("area_no",         String(area_no));
  imageUrl.searchParams.set("block_no",        String(block_no));
  imageUrl.searchParams.set("lot_type",        String(lot_type));
  imageUrl.searchParams.set("available_count", String(available_count));

  const imageResponse = await GET(new NextRequest(imageUrl));
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const filename = `lot-availability/${crypto.randomUUID()}.jpg`;

  const blob = await put(filename, imageBuffer, {
    access: "public",
    contentType: "image/jpeg",
  });

  return NextResponse.json({ url: blob.url });
}
