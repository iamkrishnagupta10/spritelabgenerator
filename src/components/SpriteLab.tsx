"use client";

import React, { useMemo, useState } from "react";

type CharacterName = "doux" | "mort" | "targ" | "vita";

type ApiResponse = {
  pngBase64: string;
  metadata: any;
  name: CharacterName;
};

export default function SpriteLab() {
  const [name, setName] = useState<CharacterName>("mort");
  const [prompt, setPrompt] = useState<string>(
    "A cute pixel-art astronaut mascot for Nonilion, 24-frame walk cycle + 4-frame idle, clean readable silhouette, no background"
  );
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const previewSrc = useMemo(() => {
    if (!res?.pngBase64) return null;
    return `data:image/png;base64,${res.pngBase64}`;
  }, [res]);

  async function generate() {
    setBusy(true);
    setErr(null);
    setRes(null);

    try {
      const r = await fetch("/api/sprite/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, prompt }),
      });

      const json = (await r.json()) as ApiResponse & { error?: string };
      if (!r.ok) throw new Error(json.error || "Failed");

      setRes(json);
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
    if (!res?.pngBase64) return;
    const bytes = Uint8Array.from(atob(res.pngBase64), (c) => c.charCodeAt(0));
    downloadFile(`${res.name}.png`, new Blob([bytes], { type: "image/png" }));
  }

  function downloadMetadata() {
    if (!res?.metadata) return;
    downloadFile(`${res.name}.json`, new Blob([JSON.stringify(res.metadata, null, 2)], { type: "application/json" }));
  }

  const styles = {
    container: {
      minHeight: "100vh",
      backgroundColor: "#000",
      color: "#fff",
      fontFamily: "sans-serif",
      padding: "2.5rem 1.5rem",
    },
    wrapper: {
      maxWidth: "64rem",
      margin: "0 auto",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "2rem",
      flexWrap: "wrap" as const,
      gap: "1rem",
    },
    brand: {
      fontSize: "0.75rem",
      letterSpacing: "0.2em",
      color: "rgba(255,255,255,0.6)",
      textTransform: "uppercase" as const,
    },
    title: {
      marginTop: "0.5rem",
      fontSize: "1.5rem",
      fontWeight: 600,
    },
    subtitle: {
      marginTop: "0.25rem",
      fontSize: "0.875rem",
      color: "rgba(255,255,255,0.6)",
    },
    badge: {
      borderRadius: "9999px",
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "0.5rem 1rem",
      fontSize: "0.75rem",
      color: "rgba(255,255,255,0.7)",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
      gap: "1.5rem",
    },
    card: {
      borderRadius: "1rem",
      border: "1px solid rgba(255,255,255,0.1)",
      backgroundColor: "rgba(255,255,255,0.03)",
      padding: "1.25rem",
    },
    label: {
      fontSize: "0.75rem",
      color: "rgba(255,255,255,0.6)",
      display: "block",
      marginBottom: "0.5rem",
    },
    buttonGroup: {
      display: "flex",
      gap: "0.5rem",
      marginBottom: "1.25rem",
    },
    charButton: (isSelected: boolean) => ({
      borderRadius: "0.75rem",
      border: isSelected ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
      backgroundColor: isSelected ? "#fff" : "transparent",
      color: isSelected ? "#000" : "rgba(255,255,255,0.8)",
      padding: "0.5rem 0.75rem",
      fontSize: "0.875rem",
      cursor: "pointer",
      transition: "all 0.2s",
    }),
    textarea: {
      width: "100%",
      height: "10rem",
      resize: "none" as const,
      borderRadius: "0.75rem",
      border: "1px solid rgba(255,255,255,0.15)",
      backgroundColor: "rgba(0,0,0,0.4)",
      padding: "0.75rem",
      fontSize: "0.875rem",
      color: "#fff",
      outline: "none",
      fontFamily: "inherit",
    },
    generateBtn: {
      borderRadius: "0.75rem",
      padding: "0.5rem 1rem",
      fontSize: "0.875rem",
      fontWeight: 500,
      backgroundColor: busy ? "rgba(255,255,255,0.2)" : "#fff",
      color: busy ? "rgba(255,255,255,0.6)" : "#000",
      border: "none",
      cursor: busy ? "not-allowed" : "pointer",
      transition: "all 0.2s",
    },
    actions: {
      marginTop: "1rem",
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      flexWrap: "wrap" as const,
    },
    previewHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1rem",
    },
    downloadBtn: (enabled: boolean) => ({
      borderRadius: "0.75rem",
      border: enabled ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.1)",
      backgroundColor: "transparent",
      color: enabled ? "#fff" : "rgba(255,255,255,0.4)",
      padding: "0.5rem 0.75rem",
      fontSize: "0.75rem",
      cursor: enabled ? "pointer" : "not-allowed",
      marginLeft: "0.5rem",
    }),
    previewBox: {
      backgroundColor: "#000",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "0.75rem",
      padding: "1rem",
      minHeight: "10rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    previewImg: {
      maxWidth: "100%",
      height: "auto",
      imageRendering: "pixelated" as const,
    },
    error: {
      marginTop: "1rem",
      padding: "0.75rem",
      borderRadius: "0.75rem",
      border: "1px solid rgba(239, 68, 68, 0.3)",
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      color: "rgba(254, 202, 202, 1)",
      fontSize: "0.875rem",
    },
    tip: {
      marginTop: "1rem",
      fontSize: "0.75rem",
      color: "rgba(255,255,255,0.6)",
    },
    code: {
      fontFamily: "monospace",
      color: "#fff",
      backgroundColor: "rgba(255,255,255,0.1)",
      padding: "0.1rem 0.3rem",
      borderRadius: "0.2rem",
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        <div style={styles.header}>
          <div>
            <div style={styles.brand}>NONILION</div>
            <h1 style={styles.title}>Sprite Lab</h1>
            <p style={styles.subtitle}>
              Generate a <span style={{ color: "#fff" }}>576×24</span> transparent spritesheet + Pixi atlas JSON.
            </p>
          </div>
          <div style={styles.badge}>
            output: 24×(24×24) = <span style={{ color: "#fff" }}>576×24</span>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <label style={styles.label}>Character</label>
            <div style={styles.buttonGroup}>
              {(["doux", "mort", "targ", "vita"] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setName(n)}
                  style={styles.charButton(n === name)}
                >
                  {n}
                </button>
              ))}
            </div>

            <label style={styles.label}>Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={styles.textarea}
              placeholder="Describe your character (pixel art, readable silhouette, etc.)"
            />

            <div style={styles.actions}>
              <button
                disabled={busy}
                onClick={generate}
                style={styles.generateBtn}
              >
                {busy ? "Generating…" : "Generate spritesheet"}
              </button>
              <div style={styles.tip}>
                Background removed automatically (via OpenAI)
              </div>
            </div>

            {err && (
              <div style={styles.error}>
                {err}
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.previewHeader}>
              <div style={styles.label}>Preview</div>
              <div>
                <button
                  disabled={!res}
                  onClick={downloadPng}
                  style={styles.downloadBtn(!!res)}
                >
                  Download PNG
                </button>
                <button
                  disabled={!res}
                  onClick={downloadMetadata}
                  style={styles.downloadBtn(!!res)}
                >
                  Download JSON
                </button>
              </div>
            </div>

            <div style={styles.previewBox}>
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="spritesheet"
                  style={styles.previewImg}
                />
              ) : (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>
                  No spritesheet yet.
                </div>
              )}
            </div>

            {res && (
              <div style={styles.tip}>
                Tip: save PNG to <span style={styles.code}>/public/characters/{res.name}.png</span> and your existing
                Pixi loader will work.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
