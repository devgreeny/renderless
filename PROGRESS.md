# Renderless - Project Progress Summary

## What We Built

**Renderless** is an AI-powered architectural visualization tool that transforms photos into professional renders and allows iterative editing through a conversational interface.

---

## Current Architecture

### Frontend (Next.js + React)
```
frontend/
├── app/page.tsx              # Main application - two-column layout
├── components/
│   └── Chat/
│       └── ChatInterface.tsx # Conversational AI assistant panel
```

### Backend (FastAPI + Python)
```
backend/
├── main.py                   # FastAPI app entry point
├── routers/
│   ├── render.py            # Image rendering endpoints
│   ├── chat.py              # Conversational AI endpoint
│   └── generate.py          # Legacy generation endpoints
├── services/
│   ├── replicate_service.py # Replicate API with retry logic
│   └── openai_service.py    # OpenAI API integration
```

---

## Current Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS PHOTO                       │
│                    (can include red pen markups)                 │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 1: ANALYZE IMAGE                         │
│  GPT-4o analyzes for:                                           │
│  - Red pen annotations (circles, arrows, X marks, text)         │
│  - Scene description                                             │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│               STEP 2: CONVERT TO RENDER STYLE                    │
│  Flux Kontext Pro transforms photo into:                        │
│  - Cinematic architectural visualization                         │
│  - Golden hour lighting                                          │
│  - Professional materials and textures                           │
│  - Hyper-realistic arch-viz quality                              │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              STEP 3: CONVERSATIONAL EDITING                      │
│  Chat assistant (GPT-4o):                                        │
│  - Acknowledges red pen markups specifically                     │
│  - Generates detailed, context-aware suggestions                 │
│  - Asks follow-up questions to build detailed prompts            │
│  - Prompts user to select region before generating               │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 4: GENERATE EDIT                         │
│  With mask (recommended):                                        │
│  → Flux Fill Pro (inpainting) - pixel-perfect outside mask      │
│                                                                  │
│  Without mask:                                                   │
│  → Flux Kontext Pro with preservation wrapper                    │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STEP 5: ITERATE                                │
│  Chat continues conversation:                                    │
│  - "What do you think?"                                          │
│  - "What would you like to refine?"                              │
│  - Build next prompt, repeat                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## What's Working Well

### ✅ Photo to Render Conversion
- Flux Kontext Pro successfully converts photos to cinematic arch-viz style
- Golden hour lighting, polished materials, professional quality
- Preserves composition and camera angle

### ✅ Red Pen Analysis
- GPT-4o Vision accurately detects red markups
- Identifies shapes (poles, towers, buildings)
- Reads handwritten text/labels
- Uses annotations to generate specific suggestions

### ✅ Conversational Interface
- Cursor-style right panel chat
- Context-aware suggestions based on analysis
- Builds detailed prompts through Q&A
- Continues conversation after generation

### ✅ Region Selection
- Polygon drawing tool for precise area selection
- Visual feedback with purple overlay
- Integrates with chat flow

### ✅ Rate Limit Handling
- Exponential backoff retry for Replicate API
- Parses rate limit reset time from errors
- Automatically retries up to 5 times

### ✅ Version History
- Horizontal thumbnail strip showing all versions
- Click to switch between versions
- Original photo always accessible

---

## Known Issues & Limitations

### ⚠️ Flux Kontext Preservation
- Without a mask, Flux Kontext often changes more than intended
- Camera angles, lighting, and composition can shift
- **Workaround**: Always use region selection for edits

### ⚠️ Generation Time
- Initial render conversion: ~20-30 seconds
- Each edit: ~15-25 seconds
- No streaming/progress indication during generation

### ⚠️ Chat Initialization
- Sometimes the initial greeting doesn't load if analysis is slow
- Could improve with loading states

### ⚠️ Mobile Responsiveness
- Current layout assumes desktop width
- Chat panel would need to be a drawer on mobile

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/render` | POST | Convert photo to arch-viz render |
| `/api/edit` | POST | Edit image with prompt (+ optional mask) |
| `/api/chat` | POST | Conversational AI for prompt building |
| `/api/analyze` | POST | Analyze image with GPT-4o Vision |

---

## Models Used

| Model | Provider | Purpose |
|-------|----------|---------|
| `flux-kontext-pro` | Replicate | Photo→Render, General edits |
| `flux-fill-pro` | Replicate | Masked inpainting |
| `gpt-4o` | OpenAI | Image analysis, Chat AI |

---

## Next Steps to Work On

### High Priority

1. **Improve Edit Precision Without Mask**
   - Current Flux Kontext edits change too much
   - Research alternative approaches:
     - Auto-generate mask from prompt using SAM
     - Use ControlNet for structure preservation
     - Try different models (SDXL inpainting)

2. **Loading States & Progress**
   - Add progress bar during generation
   - Show estimated time remaining
   - Stream partial results if possible

3. **Error Handling in Chat**
   - Better error messages when generation fails
   - Retry suggestions
   - Fallback options

### Medium Priority

4. **Multi-Element Red Pen**
   - Track multiple marked areas
   - Work through each systematically
   - "Next, let's work on the area you marked on the right..."

5. **Prompt Templates**
   - Save successful prompts as templates
   - Quick-apply for common elements (poles, tanks, buildings)
   - User can build a library

6. **Comparison View**
   - Side-by-side before/after
   - Slider to reveal changes
   - Overlay mode

7. **Export Options**
   - High-resolution export
   - Multiple formats (PNG, JPG, TIFF)
   - Export with annotations

### Lower Priority

8. **Mobile Layout**
   - Responsive design
   - Chat as bottom sheet or drawer
   - Touch-friendly polygon drawing

9. **User Accounts & Projects**
   - Save projects
   - Resume later
   - Share renders

10. **Batch Processing**
    - Upload multiple photos
    - Apply same edits to all
    - Consistent style across set

---

## Environment Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env with:
OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...

# Run
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Key Files to Know

| File | What It Does |
|------|--------------|
| `frontend/app/page.tsx` | Main UI, image display, region selection |
| `frontend/components/Chat/ChatInterface.tsx` | Chat panel, message handling, suggestions |
| `backend/routers/render.py` | Photo→render, edit endpoints |
| `backend/routers/chat.py` | GPT-4o conversation logic, prompt building |
| `backend/services/replicate_service.py` | Replicate API wrapper with retry |

---

## Prompt Reference

### Photo → Render (Current)
```
Transform this real-world photograph into a cinematic architectural visualization.
Preserve the exact building shape, geometry, camera angle, perspective...
Golden hour lighting, polished materials, hyper-realistic...
```

### Edit Wrapper (Current)
```
CRITICAL: Make ONLY the specific change described below.
Keep EVERYTHING else EXACTLY the same...
CHANGE TO MAKE: [user prompt]
PRESERVE EXACTLY: camera, lighting, perspective, foreground...
```

---

*Last updated: January 11, 2026*

