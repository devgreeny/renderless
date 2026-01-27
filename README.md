# Renderless

AI-powered architectural rendering platform. Transform sketches and photos into photorealistic renders with intelligent editing.

## Features

- **Upload & Generate**: Start with sketches, photos, or reference images
- **Click-to-Mask**: Select any region by clicking — uses smart color-based segmentation
- **AI Inpainting**: Regenerate only the masked area while preserving the rest
- **Version History**: Track all changes, branch from any version
- **Flaw Marking**: Pinpoint specific issues in renders for targeted fixes

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Zustand (state management)
- react-zoom-pan-pinch (canvas interaction)

### Backend
- FastAPI
- OpenAI API (DALL-E 3 for generation, DALL-E 2 for inpainting)
- Pillow (image processing)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- OpenAI API key

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp env.example.txt .env
# Edit .env and add your OPENAI_API_KEY

# Run the server
python main.py
```

The API will be available at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment (optional - defaults work for local dev)
cp env.example.txt .env.local

# Run the development server
npm run dev
```

The app will be available at `http://localhost:3000`

## Usage

1. **Upload an Image**: Click "Upload" or drag & drop a sketch/photo
2. **Select the Mask Tool**: Click the pen icon in the toolbar
3. **Click to Select**: Click on any region to create a mask (uses color-based selection)
4. **Enter a Prompt**: Describe what you want to generate in the selected area
5. **Generate**: Click the Generate button or press Enter
6. **Review**: Use the Version History panel to compare versions
7. **Mark Flaws**: Use the flaw tool to pinpoint specific issues

## Project Structure

```
SimpleRender/
├── frontend/
│   ├── app/                 # Next.js app router
│   ├── components/
│   │   ├── Canvas/          # Image canvas & segmentation
│   │   ├── Toolbar/         # Upload, tools, prompt input
│   │   └── VersionHistory/  # Version timeline
│   ├── stores/              # Zustand state
│   └── lib/                 # Utilities & API client
├── backend/
│   ├── main.py              # FastAPI app
│   ├── routers/             # API endpoints
│   ├── services/            # OpenAI integration
│   └── models/              # Pydantic schemas
└── proj_overview.md         # Project requirements
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/generate` | POST | Generate/edit image |
| `/api/analyze` | POST | Analyze image with GPT-4V |

## Development Notes

### Segmentation
Currently uses a simple color-based flood fill algorithm for region selection. For production, consider integrating:
- Meta's SAM (Segment Anything Model) via WASM
- Custom segmentation models for architectural elements

### Image Generation
Uses OpenAI's DALL-E models:
- DALL-E 3 for new generations
- DALL-E 2 for inpainting (masked editing)

For higher quality architectural renders, consider:
- Replicate API with SDXL + ControlNet
- Self-hosted Flux models
- Stability AI's API

## License

Private — All rights reserved

