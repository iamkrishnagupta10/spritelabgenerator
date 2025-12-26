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

// Simple Grid Slicer (Divide & Conquer)
async function sliceGrid(sourcePng: Buffer, rows: number, cols: number) {
  const sourceImage = sharp(sourcePng).ensureAlpha();
  const meta = await sourceImage.metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;

  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);

  const frames: Buffer[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const buffer = await sourceImage
        .clone()
        .extract({
          left: col * cellW,
          top: row * cellH,
          width: cellW,
          height: cellH,
        })
        .trim() // Auto-crop to content
        .resize(24, 24, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.nearest,
        })
        .toBuffer();
      frames.push(buffer);
    }
  }
  return frames;
}

async function resizeTo128(png: Buffer) {
  return await sharp(png)
    .resize(128, 128, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

type Mode = "concept" | "idle" | "walk";

async function openaiGenerateImage(prompt: string, mode: Mode) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  let systemPrompt = "";
  let size = "1024x1024";

  if (mode === "concept") {
    systemPrompt = `
You are a pixel art concept artist.
Generate ONE single 24x24 pixel art character on a transparent background.
- Style: Retro, NES/SNES, clean lines, readable silhouette.
- View: Front-facing or 3/4 view (idle stance).
- Dimensions: The character must fit within a 24x24 pixel box.
- Output: A single transparent PNG.
`.trim();
  } else if (mode === "idle") {
    // 2x2 Grid = 4 Frames
    systemPrompt = `
You are a pixel art generator.
Generate a clean 2x2 GRID (2 rows, 2 columns) of sprites.
- Total 4 frames.
- Content: 4 frames of IDLE animation (breathing, bobbing) for the character.
- Background: Transparent.
- Layout: 2 rows, 2 columns.
- Style: Match the concept exactly.
`.trim();
  } else if (mode === "walk") {
    // 2x3 Grid (3 rows, 2 cols) = 6 Frames
    systemPrompt = `
You are a pixel art generator.
Generate a clean 3x2 GRID (3 rows, 2 columns) of sprites.
- Total 6 frames.
- Content: 6 frames of WALK cycle (Side view) for the character.
- Background: Transparent.
- Layout: 3 rows, 2 columns.
- Style: Match the concept exactly.
`.trim();
  }

  const body = {
    model: "gpt-image-1",
    prompt: `${systemPrompt}\n\nUser Concept: ${prompt}`,
    background: "transparent",
    size: size,
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

    if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

    if (mode === "concept") {
      // Concept Mode: Generate Single Preview
      let raw: Buffer | null = null;
      for (let i = 0; i < 2; i++) {
        const attempt = await openaiGenerateImage(prompt, "concept");
        if (await hasAnyTransparency(attempt)) {
          raw = attempt;
          break;
        }
      }
      if (!raw) raw = await openaiGenerateImage(prompt, "concept");

      const preview = await resizeTo128(raw!);
      return NextResponse.json({
        mode: "concept",
        pngBase64: preview.toString("base64")
      });

    } else {
      // Sheet Mode: PARALLEL GENERATION
      // 1. Idle (2x2)
      // 2. Walk (3x2)

      const [idleRaw, walkRaw] = await Promise.all([
        openaiGenerateImage(prompt, "idle"),
        openaiGenerateImage(prompt, "walk")
      ]);

      // Helper to process robustly with retry if solid block? 
      // For now assume "sheet" mode generators are reliable enough or user can retry.

      // Slice
      // Idle: 2x2 -> 4 frames
      const idleFrames = await sliceGrid(idleRaw, 2, 2);

      // Walk: 3 rows, 2 cols -> 6 frames
      const walkFrames = await sliceGrid(walkRaw, 3, 2);

      // Assembly
      const destFrames: Buffer[] = new Array(24).fill(null);
      const blank = await sharp({
        create: { width: 24, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).png().toBuffer();

      // 0-3: Idle
      for (let i = 0; i < 4; i++) destFrames[i] = idleFrames[i] || blank;

      // 4-9: Walk
      for (let i = 0; i < 6; i++) destFrames[4 + i] = walkFrames[i] || blank;

      // 10-23: Blank
      for (let i = 10; i < 24; i++) destFrames[i] = blank;

      // Stitch
      const compositeOps = destFrames.map((buf, idx) => ({
        input: buf || blank,
        left: idx * 24,
        top: 0,
      }));

      const finalPng = await sharp({
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
