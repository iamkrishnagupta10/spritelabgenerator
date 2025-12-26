import sharp from "sharp";

interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Robustly slices a sprite sheet by detecting content islands using projection profiles.
 * 1. Computes Row Histogram to find vertical ranges of content.
 * 2. Within each Row Range, computes Column Histogram to find horizontal ranges.
 * 3. Extracts detected bounding boxes.
 * 4. Sorts them (Row-major) and maps strictly to Idle/Walk frames.
 */
export async function smartSlice(sourceBuffer: Buffer): Promise<Buffer> {
    const image = sharp(sourceBuffer).ensureAlpha();
    const { data, info } = await image
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    if (channels !== 4) throw new Error("Image must have alpha channel");

    // 1. Row Projection (Y-Axis)
    const rowHasContent = new Array(height).fill(false);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const alpha = data[idx + 3];
            if (alpha > 10) { // Threshold for content
                rowHasContent[y] = true;
                break; // Found content in this row, move to next
            }
        }
    }

    // Group rows into strips
    const rowStrips: { start: number; end: number }[] = [];
    let inStrip = false;
    let startY = 0;

    for (let y = 0; y < height; y++) {
        if (rowHasContent[y]) {
            if (!inStrip) {
                inStrip = true;
                startY = y;
            }
        } else {
            if (inStrip) {
                inStrip = false;
                // Found a gap. Store the strip if it's significant (e.g. > 5px tall)
                if (y - startY > 5) {
                    rowStrips.push({ start: startY, end: y });
                }
            }
        }
    }
    if (inStrip && height - startY > 5) {
        rowStrips.push({ start: startY, end: height });
    }

    // 2. Column Projection (X-Axis) PER STRIP
    const detectedSprites: BoundingBox[] = [];

    for (const strip of rowStrips) {
        const colHasContent = new Array(width).fill(false);

        // Scan only within this vertical strip
        for (let x = 0; x < width; x++) {
            for (let y = strip.start; y < strip.end; y++) {
                const idx = (y * width + x) * 4;
                const alpha = data[idx + 3];
                if (alpha > 10) {
                    colHasContent[x] = true;
                    break;
                }
            }
        }

        // Group columns into boxes
        let inBox = false;
        let startX = 0;

        for (let x = 0; x < width; x++) {
            if (colHasContent[x]) {
                if (!inBox) {
                    inBox = true;
                    startX = x;
                }
            } else {
                if (inBox) {
                    inBox = false;
                    if (x - startX > 5) { // Min width 5px
                        detectedSprites.push({
                            x: startX,
                            y: strip.start,
                            w: x - startX,
                            h: strip.end - strip.start
                        });
                    }
                }
            }
        }
        if (inBox && width - startX > 5) {
            detectedSprites.push({
                x: startX,
                y: strip.start,
                w: width - startX,
                h: strip.end - strip.start
            });
        }
    }

    // 3. Sort Sprites (Row Major: Top->Bottom, Left->Right)
    // We allow some fuzziness in Y to group them into visual "rows"
    detectedSprites.sort((a, b) => {
        const centerAy = a.y + a.h / 2;
        const centerBy = b.y + b.h / 2;
        // If centers are close (within 24px), treat as same row, sort by X
        if (Math.abs(centerAy - centerBy) < 24) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });

    // 4. Strict Mapping & Stitching
    const destFrames: Buffer[] = new Array(24).fill(null);

    // Create a reusable blank
    const blank = await sharp({
        create: { width: 24, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).png().toBuffer();

    // Helper to extract and resize a sprite
    const processSprite = async (box: BoundingBox) => {
        try {
            // Double check bounds to prevent sharp errors
            const safeX = Math.max(0, box.x);
            const safeY = Math.max(0, box.y);
            const safeW = Math.min(width - safeX, box.w);
            const safeH = Math.min(height - safeY, box.h);

            return await image
                .clone()
                .extract({ left: safeX, top: safeY, width: safeW, height: safeH })
                // We don't need .trim() here because we detected the content bounds exactly!
                // But we can do it to be extra safe around edges if our threshold was loose.
                .resize(24, 24, {
                    fit: "contain",
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    kernel: sharp.kernel.nearest
                })
                .toBuffer();
        } catch (e) {
            console.error("Error processing sprite box:", box, e);
            return blank;
        }
    };

    // Logic: 
    // We expect at least 10 sprites (5 Idle row 1 + 5 Walk row 2).
    // Ideally Row 1 has 5, Row 2 has 5.
    // We map indices 0-3 (Idle) and 4-9 (Walk).

    // MAPPING:
    // detected[0] -> dest[0] (Idle 1)
    // ...
    // detected[3] -> dest[3] (Idle 4)
    // detected[4] -> Skipped (often a duplicate or transition frame in 5-col grid) ??
    // NO: The prompt generated 5 columns.
    // Reference says Idle is 4 frames (0-3).
    // So we take the first 4 detected sprites as Idle.

    // Reference says Walk is 6 frames (4-9).
    // We need to source these from the "Walk Row" (Row 2).
    // If we collected sprites in order: 0,1,2,3,4 (Row 1), 5,6,7,8,9 (Row 2).

    // Idle (0-3): detected[0..3]
    for (let i = 0; i < 4; i++) {
        if (detectedSprites[i]) {
            destFrames[i] = await processSprite(detectedSprites[i]);
        } else {
            destFrames[i] = blank;
        }
    }

    // Walk (4-9): 
    // We want the Walk cycle. In the grid, that's usually Row 2.
    // detected indices 5,6,7,8,9 are likely the walk frames (if Row 1 had 5 items).
    // Let's assume sequential mapping from the sorted list is the robust way
    // because we don't know exactly how many items per row the user got.
    // BUT we know the Prompt asked for "Row 1: 5 frames Idle", "Row 2: 5 frames Walk".

    // So:
    // detected[0-4] are likely Row 1 (Idle). We use 0-3.
    // detected[5-9] are likely Row 2 (Walk). We use all 5.
    // dest[4-9] needs 6 frames.
    // We map detected[5] -> dest[4] (Walk 1)
    // ...
    // detected[9] -> dest[8] (Walk 5)
    // detected[10] -> dest[9] (Walk 6 - from Row 3?)

    const walkStartIndexStr = 5; // Start taking from the 6th detected sprite
    for (let i = 0; i < 6; i++) {
        const sourceIdx = walkStartIndexStr + i;
        if (detectedSprites[sourceIdx]) {
            destFrames[4 + i] = await processSprite(detectedSprites[sourceIdx]);
        } else {
            // Fallback: If we run out of frames, maybe loop the last one? or blank.
            destFrames[4 + i] = blank;
        }
    }

    // Fill remaining empty slots
    for (let i = 10; i < 24; i++) {
        destFrames[i] = blank;
    }

    // Stitch
    const compositeOps = destFrames.map((buf, idx) => ({
        input: buf || blank,
        left: idx * 24,
        top: 0,
    }));

    const finalStrip = await sharp({
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

    return finalStrip;
}
