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



async function resizeTo128(png: Buffer) {
  return await sharp(png)
    .resize(128, 128, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

type Mode = "concept" | "frame";

async function openaiGenerateImage(prompt: string, mode: Mode, frameDesc?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  let systemPrompt = "";
  let size = "1024x1024";

  if (mode === "concept") {
    // ... same as before
    systemPrompt = `
You are a pixel art concept artist.
Generate ONE single 24x24 pixel art character on a transparent background.
- Style: Retro, NES/SNES, clean lines, readable silhouette.
- View: Front-facing or 3/4 view (idle stance).
- Dimensions: The character must fit within a 24x24 pixel box.
- Output: A single transparent PNG.
`.trim();
  } else {
    // Frame Mode: Generate 1 specific frame
    systemPrompt = `
You are a pixel art sprite generator.
Generate ONE single 24x24 pixel art character frame.
- Action: ${frameDesc || "Idle"}.
- Style: Retro, NES/SNES.
- View: Side view or 3/4 view as appropriate for the action.
- Constraint: The character MUST be fully visible, centered, and fit in 24x24 pixels.
- Background: Transparent.
- Consistency: Match the user's concept description perfectly.
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
      // ATOMIC GENERATION: 10 Separate Cals
      // 1. Idle x4
      // 2. Walk x6

      // Helper for single frame prompt
      const generateFrame = (type: "idle" | "walk", index: number) => {
        const framePrompt = type === "idle"
          ? `Idle Animation Frame ${index + 1}/4 (Standing, breathing, subtle move)`
          : `Walk Cycle Frame ${index + 1}/6 (Side view walking step)`;

        return openaiGenerateImage(prompt, "frame", framePrompt);
      };

      // Launch all 10 requests in parallel
      const [i0, i1, i2, i3, w0, w1, w2, w3, w4, w5] = await Promise.all([
        generateFrame("idle", 0),
        generateFrame("idle", 1),
        generateFrame("idle", 2),
        generateFrame("idle", 3),
        generateFrame("walk", 0),
        generateFrame("walk", 1),
        generateFrame("walk", 2),
        generateFrame("walk", 3),
        generateFrame("walk", 4),
        generateFrame("walk", 5),
      ]);

      // Resize all to 24x24
      const processedFrames = await Promise.all(
        [i0, i1, i2, i3, w0, w1, w2, w3, w4, w5].map(async (buf) => {
          // Resize logic: Ensure it fits 24x24 container
          return sharp(buf)
            .resize(24, 24, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
              kernel: sharp.kernel.nearest
            })
            .toBuffer();
        })
      );

      // Assembly
      const destFrames: Buffer[] = new Array(24).fill(null);
      const blank = await sharp({
        create: { width: 24, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).png().toBuffer();

      // Fill slots
      // 0-3 Idle
      processedFrames.slice(0, 4).forEach((buf, i) => destFrames[i] = buf);
      // 4-9 Walk
      processedFrames.slice(4, 10).forEach((buf, i) => destFrames[4 + i] = buf);
      // Rest Blank
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
