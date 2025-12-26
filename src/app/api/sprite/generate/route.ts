import { NextResponse } from "next/server";
import sharp from "sharp";

type CharacterName = "doux" | "mort" | "targ" | "vita";

function atlasDataGenerator(name: CharacterName) {
  // STRICTLY match mort.json structure
  const baseAtlas: any = {
    frames: {},
    meta: {
      image: `/characters/${name}.png`,
      format: "RGBA8888",
      size: { w: 576, h: 24 },
      scale: "1",
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

// Check alpha transparency
async function hasAnyTransparency(png: Buffer) {
  const { data } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

// Slice a 5x5 grid and re-map to strict mort.json indices
// Target: 24 frames total (0-23)
// IDLE: 0,1,2,3 (4 frames)
// WALK: 4,5,6,7,8,9 (6 frames)
async function sliceAndStitchStrict(sourcePng: Buffer) {
  const sourceImage = sharp(sourcePng).ensureAlpha();
  const meta = await sourceImage.metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;

  const cellW = Math.floor(width / 5);
  const cellH = Math.floor(height / 5);

  // We need to extract 25 source cells (0..24)
  const sourceCells: Buffer[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const buffer = await sourceImage
        .clone()
        .extract({
          left: col * cellW,
          top: row * cellH,
          width: cellW,
          height: cellH,
        })
        .resize(24, 24, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.nearest,
        })
        .toBuffer();
      sourceCells.push(buffer);
    }
  }

  // MAPPING logic
  // sourceCells indices:
  // Row 0: 0,1,2,3,4
  // Row 1: 5,6,7,8,9
  // Row 2: 10,11,12,13,14 ...

  const destFrames: Buffer[] = new Array(24).fill(null);

  // IDLE (0-3) <- Source Row 0 [0,1,2,3]
  // We skip Source [4] (Row 0, col 4) effectively, or use it later?
  // Our prompt will ask for 5 frames of Idle in Row 1. We take 4.
  destFrames[0] = sourceCells[0];
  destFrames[1] = sourceCells[1];
  destFrames[2] = sourceCells[2];
  destFrames[3] = sourceCells[3];

  // WALK (4-9) <- Source Row 1 [5,6,7,8,9] + Row 2 [10]
  // Prompt asks for 5-6 frames of walk in Row 2.
  // We'll map Source Row 1 (indices 5-9) to Dest 4-8.
  // And Source Row 2 first cell (index 10) to Dest 9.

  destFrames[4] = sourceCells[5]; // Walk 1
  destFrames[5] = sourceCells[6]; // Walk 2
  destFrames[6] = sourceCells[7]; // Walk 3
  destFrames[7] = sourceCells[8]; // Walk 4
  destFrames[8] = sourceCells[9]; // Walk 5
  destFrames[9] = sourceCells[10]; // Walk 6 (from next row)

  // Fill the rest (10-23) with transparent blank or just copy idle
  // to avoid broken images if the app cycles indiscriminately.
  // We'll create a blank frame.
  const blank = await sharp({
    create: { width: 24, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).png().toBuffer();

  for (let i = 10; i < 24; i++) {
    destFrames[i] = blank;
  }

  // Composite into 576x24 strip
  const compositeOps = destFrames.map((buf, idx) => ({
    input: buf || blank,
    left: idx * 24,
    top: 0,
  }));

  const final = await sharp({
    create: {
      width: 576,
      height: 24,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer();

  return final;
}

async function resizeTo128(png: Buffer) {
  return await sharp(png)
    .resize(128, 128, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

async function openaiGenerateImage(prompt: string, mode: "concept" | "sheet") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  let systemPrompt = "";
  if (mode === "concept") {
    systemPrompt = `
You are a pixel art concept artist.
Generate ONE single 24x24 pixel art character on a transparent background.
- Style: Retro, NES/SNES, clean lines, readable silhouette.
- View: Front-facing or 3/4 view (idle stance).
- Dimensions: The character must fit within a 24x24 pixel box.
- Output: A single transparent PNG (approx 256x256 or 512x512, will be downscaled).
`.trim();
  } else {
    // Sheet mode: STRICT ALIGNMENT
    systemPrompt = `
You are a pixel art generator.
Generate a valid 5x5 GRID of sprites.
- The output image is square (e.g. 1024x1024).
- Divide it visually into 5 rows (Row 1 to Row 5) and 5 columns.
- Place ONE character sprite in each cell.

STRICT ROW CONTENTS:
- Row 1 (Top): 5 frames of IDLE animation (breathing, subtle movement).
- Row 2 (2nd down): 5 frames of WALK cycle (Side view walking).
- Row 3 (3rd down): 5 frames continuing the walk cycle or running.
- Row 4/5: Variations.

- Background MUST be transparent.
- Characters should be small, centered in their grid cells.
- Consistency: MATCH the concept prompt exactly.
`.trim();
  }

  const body = {
    model: "gpt-image-1",
    prompt: `${systemPrompt}\n\nUser Concept: ${prompt}`,
    background: "transparent",
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
    throw new Error(`OpenAI error (${r.status}): ${text}`);
  }

  const json = await r.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json returned");

  return Buffer.from(b64, "base64");
}

export async function POST(req: Request) {
  try {
    const { name, prompt, mode } = await req.json();
    const modeVal = mode === "concept" ? "concept" : "sheet";

    if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

    // Retry loop for transparency
    let raw: Buffer | null = null;
    for (let i = 0; i < 2; i++) {
      const attempt = await openaiGenerateImage(prompt, modeVal);
      if (await hasAnyTransparency(attempt)) {
        raw = attempt;
        break;
      }
    }
    if (!raw) raw = await openaiGenerateImage(prompt, modeVal);

    if (modeVal === "concept") {
      // Return single preview image
      const preview = await resizeTo128(raw!);
      return NextResponse.json({
        mode: "concept",
        pngBase64: preview.toString("base64")
      });
    } else {
      // Sheet mode: Strict Slice & Map
      const finalPng = await sliceAndStitchStrict(raw!);
      const metadata = name ? atlasDataGenerator(name as CharacterName) : {};

      return NextResponse.json({
        mode: "sheet",
        name,
        pngBase64: finalPng.toString("base64"),
        metadata
      });
    }

  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
