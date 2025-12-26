
import { NextResponse } from "next/server";
import sharp from "sharp";

type CharacterName = "doux" | "mort" | "targ" | "vita";

function atlasDataGenerator(name: CharacterName) {
  const baseAtlas: any = {
    frames: {},
    meta: {
      image: `/characters/${name}.png`,
      format: "RGBA8888",
      size: { w: 576, h: 24 },
      scale: "0.32",
    },
    animations: {
      walk: [`4_${name}`, `5_${name}`, `6_${name}`, `7_${name}`, `8_${name}`, `9_${name}`],
      idle: [`0_${name}`, `1_${name}`, `2_${name}`, `3_${name}`],
    },
  };

  for (let col = 0; col < 24; col++) {
    baseAtlas.frames[`${col}_${name}`] = {
      frame: { x: col * 24, y: 0, w: 24, h: 24 },
      sourceSize: { w: 24, h: 24 },
      spriteSourceSize: { x: 0, y: 0, w: 24, h: 24 },
    };
  }

  return baseAtlas;
}

async function hasAnyTransparency(png: Buffer) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // RGBA bytes; check if any alpha < 255
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function forceTo576x24(png: Buffer) {
  const out = await sharp(png)
    .ensureAlpha()
    .resize(576, 24, { fit: "fill", kernel: sharp.kernel.nearest }) // crisp pixels
    .png()
    .toBuffer();

  const meta = await sharp(out).metadata();
  if (meta.width !== 576 || meta.height !== 24) {
    throw new Error(`Size mismatch: got ${meta.width}x${meta.height}`);
  }
  return out;
}

async function openaiGenerateTransparentSpritesheet(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const hardReqs = `
Generate a SINGLE PNG spritesheet with TRANSPARENT background.
Layout:
- 24 frames in ONE row
- each frame exactly 24x24 pixels
- final intended layout: 576x24 (24*24 by 24)
Animation meaning:
- frames 0-3: idle (breathing/blink)
- frames 4-9: walk cycle (6 frames)
- frames 10-23: extra subtle variants consistent with character
Style:
- pixel art, sharp edges, no blur, consistent proportions
- character reads well at 24x24
- NO background pixels; alpha transparency outside sprite.
`.trim();

  // OpenAI Images API (gpt-image-1). Request transparent background.
  const body = {
    model: "gpt-image-1",
    prompt: `${hardReqs}\n\nCharacter request:\n${prompt}`,
    // The API supports transparency via background=transparent in many accounts.
    background: "transparent",
    // size constraints are model dependent; we’ll enforce exact 576x24 after.
    size: "1024x1024",
  };

  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`OpenAI image gen failed (${r.status}): ${text || "no body"}`);
  }

  const json = await r.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no b64_json");

  return Buffer.from(b64, "base64");
}

export async function POST(req: Request) {
  try {
    const { name, prompt } = (await req.json()) as { name: CharacterName; prompt: string };
    if (!name || !prompt) return NextResponse.json({ error: "Missing name or prompt" }, { status: 400 });

    // Try a few times until we get actual transparency
    let img: Buffer | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const raw = await openaiGenerateTransparentSpritesheet(prompt);
      const ok = await hasAnyTransparency(raw);
      if (ok) {
        img = raw;
        break;
      }
    }
    if (!img) throw new Error("OpenAI did not return a transparent PNG after 3 attempts.");

    const finalPng = await forceTo576x24(img);
    const metadata = atlasDataGenerator(name);

    return NextResponse.json({
      name,
      pngBase64: finalPng.toString("base64"),
      metadata,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
