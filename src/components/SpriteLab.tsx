
"use client";
import { useState } from "react";

export default function SpriteLab() {
  const [prompt, setPrompt] = useState("");
  const [img, setImg] = useState<string | null>(null);

  async function generate() {
    const res = await fetch("/api/sprite/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "mort", prompt }),
    });
    const json = await res.json();
    setImg("data:image/png;base64," + json.pngBase64);
  }

  return (
    <div style={{ padding: 40, background: "#000", color: "#fff", minHeight: "100vh" }}>
      <h1>Nonilion Sprite Lab</h1>
      <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} />
      <br/>
      <button onClick={generate}>Generate</button>
      {img && <img src={img} style={{ imageRendering: "pixelated" }} />}
    </div>
  );
}
