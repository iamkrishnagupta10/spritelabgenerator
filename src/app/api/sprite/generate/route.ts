
import { NextResponse } from "next/server";
import sharp from "sharp";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: "pixel art sprite sheet, 24 frames, transparent background. " + prompt,
      background: "transparent",
      size: "1024x1024",
    }),
  });

  const j = await r.json();
  const raw = Buffer.from(j.data[0].b64_json, "base64");

  const final = await sharp(raw)
    .ensureAlpha()
    .resize(576, 24, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  return NextResponse.json({
    pngBase64: final.toString("base64"),
    metadata: {},
  });
}
