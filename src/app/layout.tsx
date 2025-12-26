import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Nonilion Sprite Lab",
    description: "Generate pixel-art character spritesheets compatible with PixiJS + LiveKit spatial-audio applications.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, background: "#000", color: "#fff", fontFamily: "sans-serif" }}>
                {children}
            </body>
        </html>
    );
}
