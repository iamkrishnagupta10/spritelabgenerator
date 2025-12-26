# Nonilion Sprite Lab 🎮

A standalone Next.js app that generates pixel-art character spritesheets compatible with PixiJS + LiveKit spatial-audio applications.

## What It Does

Simple, focused sprite generation:
- Enter a prompt describing your character
- Get a transparent PNG spritesheet (576×24 pixels)
- 24 frames of 24×24 pixel art, ready for PixiJS
- No background, nearest-neighbor scaling (no blur)

## Tech Stack

- **Next.js 14.2.5** - App Router
- **OpenAI API** - Image generation with explicit transparent background
- **Sharp** - Force-resize to exact dimensions with nearest-neighbor interpolation
- **TypeScript** - Type safety

## Getting Started

### Prerequisites

- Node.js 18+ installed
- OpenAI API key with access to image generation

### Installation

1. Clone the repository:
```bash
git clone https://github.com/iamkrishnagupta10/spritelabgenerator.git
cd spritelabgenerator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```

4. Add your OpenAI API key to `.env.local`:
```
OPENAI_API_KEY=your_api_key_here
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
npm run build
npm start
```

### Deploying to Vercel

This app is designed to be deployed independently on Vercel:

```bash
vercel --prod
```

Make sure to add your `OPENAI_API_KEY` to the Vercel environment variables.

## Usage

1. Go to `/sprite-lab`
2. Enter a character description
3. Click "Generate"
4. Download your transparent spritesheet

## Output Specs

- **Format**: PNG with transparency
- **Dimensions**: 576×24 pixels (24 frames × 24×24 each)
- **Scaling**: Nearest-neighbor (pixel-perfect, no blur)
- **Compatibility**: Direct drop-in for PixiJS sprite animations

## Project Structure

```
nonilion-sprite-lab/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── sprite/
│   │   │       └── generate/
│   │   │           └── route.ts      # API endpoint for sprite generation
│   │   ├── sprite-lab/
│   │   │   └── page.tsx              # Sprite lab page
│   │   └── page.tsx                  # Home page
│   └── components/
│       └── SpriteLab.tsx             # Main sprite lab component
├── next.config.js
├── package.json
└── README.md
```

## API Reference

### POST /api/sprite/generate

Generates a sprite sheet from a text prompt.

**Request Body:**
```json
{
  "name": "character_name",
  "prompt": "description of sprite"
}
```

**Response:**
```json
{
  "pngBase64": "base64_encoded_image_data",
  "metadata": {}
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Built for the Nonilion project
- Powered by OpenAI's image generation technology
- Image processing by Sharp

---

**Note**: This project requires an OpenAI API key with access to image generation capabilities. API usage may incur costs based on OpenAI's pricing.
