"use client";

import React, { useMemo, useState } from "react";

type CharacterName = "doux" | "mort" | "targ" | "vita";

type Step = "design" | "preview";

type ApiResponse = {
  mode: "concept" | "sheet";
  pngBase64: string;
  metadata?: any;
  name?: CharacterName;
};

export default function SpriteLab() {
  const [name, setName] = useState<CharacterName>("mort");
  const [prompt, setPrompt] = useState<string>(
    "A cute pixel-art astronaut mascot for Nonilion, white helmet, orange suit, clean simple details"
  );

  // Step 1: Concept
  const [conceptImg, setConceptImg] = useState<string | null>(null);
  const [conceptPrompt, setConceptPrompt] = useState<string>(""); // Store the prompt that generated the concept

  // Step 2: Sheet
  const [sheetRes, setSheetRes] = useState<ApiResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generateConcept() {
    setBusy(true);
    setErr(null);
    setConceptImg(null);
    setSheetRes(null); // Reset sheet if designing new concept

    try {
      const r = await fetch("/api/sprite/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "concept" }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Failed");

      setConceptImg(`data:image/png;base64,${json.pngBase64}`);
      setConceptPrompt(prompt);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function generateSheet() {
    if (!conceptImg) return;
    setBusy(true);
    setErr(null);
    setSheetRes(null);

    try {
      // Pass the concept prompt + implicit instruction to match it
      // We rely on the prompt being descriptive enough.
      // In a real advanced app, we might pass the image to vision API, but for now we stick to text.
      const r = await fetch("/api/sprite/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          prompt: conceptPrompt + " (MATCH THIS CHARACTER EXACTLY)",
          mode: "sheet"
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Failed");

      setSheetRes(json);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function downloadFile(filename: string, data: Blob) {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    if (!sheetRes?.pngBase64) return;
    const bytes = Uint8Array.from(atob(sheetRes.pngBase64), (c) => c.charCodeAt(0));
    downloadFile(`${name}.png`, new Blob([bytes], { type: "image/png" }));
  }

  function downloadMetadata() {
    if (!sheetRes?.metadata) return;
    downloadFile(`${name}.json`, new Blob([JSON.stringify(sheetRes.metadata, null, 2)], { type: "application/json" }));
  }

  const styles = {
    container: {
      minHeight: "100vh",
      backgroundColor: "#000",
      color: "#fff",
      fontFamily: "sans-serif",
      padding: "2.5rem 1.5rem",
    },
    wrapper: { maxWidth: "64rem", margin: "0 auto" },
    header: { marginBottom: "3rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "1.5rem" },
    brand: { fontSize: "0.75rem", letterSpacing: "0.2em", color: "rgba(255,255,255,0.6)", textTransform: "uppercase" as const },
    title: { fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0" },
    subtitle: { color: "rgba(255,255,255,0.6)", fontSize: "0.875rem" },

    section: { marginBottom: "3rem" },
    sectionTitle: { fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" },
    stepNum: { display: "flex", alignItems: "center", justifyContent: "center", width: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "#fff", color: "#000", fontSize: "0.75rem", fontWeight: "bold" },

    card: {
      padding: "1.5rem",
      backgroundColor: "rgba(255,255,255,0.03)",
      borderRadius: "1rem",
      border: "1px solid rgba(255,255,255,0.08)",
    },

    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" },

    label: { display: "block", fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem", textTransform: "uppercase" as const, letterSpacing: "0.05em" },

    textarea: {
      width: "100%", height: "8rem",
      backgroundColor: "rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "0.5rem",
      padding: "1rem",
      color: "#fff",
      fontSize: "0.875rem",
      lineHeight: "1.5",
      outline: "none",
      resize: "none" as const,
      fontFamily: "inherit",
    },

    btnPrimary: {
      backgroundColor: "#fff", color: "#000",
      border: "none", borderRadius: "0.5rem",
      padding: "0.75rem 1.5rem",
      fontSize: "0.875rem", fontWeight: 600,
      cursor: "pointer",
      opacity: busy ? 0.5 : 1,
    },
    btnSecondary: {
      backgroundColor: "transparent", color: "#fff",
      border: "1px solid rgba(255,255,255,0.2)", borderRadius: "0.5rem",
      padding: "0.5rem 1rem",
      fontSize: "0.75rem",
      cursor: "pointer",
      marginLeft: "0.5rem",
    },

    conceptBox: {
      width: "128px", height: "128px",
      backgroundColor: "#000",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "0.5rem",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
      marginBottom: "1rem",
    },
    conceptImg: { width: "100%", height: "100%", imageRendering: "pixelated" as const },

    sheetBox: {
      width: "100%",
      padding: "2rem",
      backgroundColor: "#000",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "0.5rem",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "auto",
      marginBottom: "1rem",
    },

    charSelect: { display: "flex", gap: "0.5rem", marginBottom: "1rem" },
    charBtn: (active: boolean) => ({
      padding: "0.25rem 0.75rem",
      borderRadius: "99px",
      border: active ? "1px solid #fff" : "1px solid rgba(255,255,255,0.2)",
      backgroundColor: active ? "#fff" : "transparent",
      color: active ? "#000" : "rgba(255,255,255,0.7)",
      cursor: "pointer", fontSize: "0.75rem",
    }),

    error: { color: "#f87171", fontSize: "0.875rem", marginTop: "1rem" }
  };

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <div style={styles.header}>
          <div style={styles.brand}>NONILION SPRITE LAB</div>
          <div style={styles.title}>Character Creator</div>
          <div style={styles.subtitle}>step 1: Design Character → Step 2: Generate Spritesheet</div>
        </div>

        {/* STEP 1 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            <span style={styles.stepNum}>1</span>
            Design Concept
          </div>
          <div style={styles.card}>
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "300px" }}>
                <label style={styles.label}>Prompt Description</label>
                <textarea
                  style={styles.textarea}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your character..."
                />
                <div style={{ marginTop: "1rem" }}>
                  <button
                    onClick={generateConcept}
                    disabled={busy}
                    style={styles.btnPrimary}
                  >
                    {busy && !conceptImg ? "Generating..." : (conceptImg ? "Regenerate Concept" : "Generate Concept")}
                  </button>
                </div>
                {err && <div style={styles.error}>{err}</div>}
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={styles.conceptBox}>
                  {conceptImg ? (
                    <img src={conceptImg} style={styles.conceptImg} />
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "0.75rem" }}>No character yet</span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
                  Single Frame Preview (24x24)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 2 */}
        <div style={{ ...styles.section, opacity: conceptImg ? 1 : 0.3, pointerEvents: conceptImg ? "auto" : "none" }}>
          <div style={styles.sectionTitle}>
            <span style={styles.stepNum}>2</span>
            Production Spritesheet
          </div>
          <div style={styles.card}>
            <label style={styles.label}>Export Settings</label>
            <div style={styles.charSelect}>
              <span style={{ fontSize: "0.875rem", color: "#fff", marginRight: "0.5rem", alignSelf: "center" }}>Filename:</span>
              {(["doux", "mort", "targ", "vita"] as const).map(c => (
                <button key={c} onClick={() => setName(c)} style={styles.charBtn(name === c)}>{c}</button>
              ))}
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <button
                onClick={generateSheet}
                disabled={busy}
                style={styles.btnPrimary}
              >
                {busy ? "Manufacturing..." : "Generate 576x24 Spritesheet from Concept"}
              </button>
            </div>

            {sheetRes && (
              <div>
                <div style={styles.sheetBox}>
                  <img src={`data:image/png;base64,${sheetRes.pngBase64}`} style={{ height: "48px", imageRendering: "pixelated" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button onClick={downloadPng} style={styles.btnPrimary}>Download PNG</button>
                  <button onClick={downloadMetadata} style={styles.btnSecondary}>Download JSON</button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
