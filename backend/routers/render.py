from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import base64
import httpx
import asyncio
from PIL import Image
import io
from config import settings
from services.replicate_service import run_with_retry
from services.openai_service import openai_service, RenderQuality, StylePreset

# Toggle between OpenAI gpt-image-1 and Replicate
USE_OPENAI = True  # Set to False to use Replicate/Flux models

# OpenAI model to use: "gpt-image-1", "gpt-image-1.5", or "dall-e-2"
# gpt-image-1/1.5: Best quality, requires org verification
# dall-e-2: Works without verification (lower quality, but still good)
OPENAI_IMAGE_MODEL = "gpt-image-1.5"  # Latest model - better quality and instruction following

router = APIRouter(prefix="/api", tags=["render"])


class RenderRequest(BaseModel):
    imageBase64: str = Field(..., alias="imageBase64")
    quality: str = Field("standard", description="Quality tier: draft, standard, or high")
    style: str = Field("real_estate", description="Style preset: real_estate, industrial, evening, modern, custom")
    
    class Config:
        populate_by_name = True


class EditRequest(BaseModel):
    imageBase64: str = Field(..., alias="imageBase64")
    prompt: str
    quality: str = Field("standard", description="Quality tier: draft, standard, or high")
    style: str = Field("real_estate", description="Style preset: real_estate, industrial, evening, modern, custom")
    referenceImages: Optional[list[str]] = Field(None, description="Reference images base64 (up to 5)")
    renderMode: str = Field("plan_to_render", description="Mode: 'plan_to_render' for accuracy, 'pretty_render' for marketing")
    
    class Config:
        populate_by_name = True


class RenderResponse(BaseModel):
    imageUrl: str
    imageBase64: str
    promptPreview: Optional[str] = Field(None, description="Preview of the prompt sent to the model")


def parse_quality(quality_str: str) -> RenderQuality:
    """Parse quality string to enum"""
    quality_map = {
        "draft": RenderQuality.DRAFT,
        "standard": RenderQuality.STANDARD,
        "high": RenderQuality.HIGH,
    }
    return quality_map.get(quality_str.lower(), RenderQuality.STANDARD)


def parse_style(style_str: str) -> StylePreset:
    """Parse style string to enum"""
    style_map = {
        "real_estate": StylePreset.REAL_ESTATE,
        "industrial": StylePreset.INDUSTRIAL,
        "evening": StylePreset.EVENING,
        "modern": StylePreset.MODERN,
        "custom": StylePreset.CUSTOM,
    }
    return style_map.get(style_str.lower(), StylePreset.REAL_ESTATE)



@router.post("/render", response_model=RenderResponse)
async def render_image(request: RenderRequest):
    """
    Photo-to-render conversion.
    Uses OpenAI gpt-image-1 or Replicate Flux based on configuration.
    Preserves original structure while applying render style.
    
    Quality tiers:
    - draft: Fast, lower fidelity (512x512 for dall-e-2, 1024x1024 for gpt-image-1)
    - standard: Default balance (1024x1024)
    - high: Best quality with HD mode (1536x1024, quality=hd)
    
    Style presets:
    - real_estate: Bright daylight, clean landscaping, marketing quality
    - industrial: Overcast, utilitarian aesthetic
    - evening: Golden hour, warm tones
    - modern: Minimalist, contemporary materials
    """
    
    # Parse quality and style
    quality = parse_quality(request.quality)
    style = parse_style(request.style)
    
    # Use OpenAI gpt-image-1 for rendering
    if USE_OPENAI:
        print("=" * 60)
        print(f"🎨 RENDER REQUEST - OpenAI {OPENAI_IMAGE_MODEL}")
        print(f"   Quality: {quality.value}, Style: {style.value}")
        print("=" * 60)
        
        if not settings.openai_api_key:
            raise HTTPException(status_code=500, detail="OpenAI API not configured")
        
        try:
            result_url, result_base64 = await openai_service.render_image(
                image_base64=request.imageBase64,
                model=OPENAI_IMAGE_MODEL,
                quality=quality,
                style_preset=style,
            )
            
            return RenderResponse(
                imageUrl=result_url,
                imageBase64=result_base64,
                promptPreview=None,  # Render uses fixed prompt
            )
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
    
    # Fallback to Replicate/Flux
    print("=" * 60)
    print("🎨 RENDER REQUEST - Using Flux Kontext")
    print("=" * 60)
    
    if not settings.replicate_api_token:
        raise HTTPException(status_code=500, detail="Replicate API not configured")
    
    try:
        # Prepare image
        print(f"📦 Preparing image...")
        image_data = base64.b64decode(request.imageBase64)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        
        # Resize if too large (max 1024 on longest side)
        max_size = 1024
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        print(f"   Size: {image.size}")
        
        # Convert to data URI
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        image_uri = f"data:image/png;base64,{image_b64}"
        
        print(f"🚀 Calling Flux Kontext...")
        
        # Cinematic architectural visualization - professional render quality
        prompt = """Transform this real-world photograph into a cinematic architectural visualization.

Preserve the exact building shape, geometry, camera angle, perspective, and relative scale of all structures.

Convert the scene into a high-end architectural render with golden hour lighting and soft sunlight. 
Clean, idealized environment with lush landscaping and greenery.
Warm reflections and polished materials throughout.

Enhance building surfaces into refined architectural materials.
Glass should be reflective and glowing. Metal should be warm-toned and premium.
Lighting should be dramatic and directional with soft cinematic shadows.

Style: Hyper-realistic architectural visualization, Unreal Engine quality, large-scale development marketing render.
High dynamic range with soft atmospheric haze.

Do NOT change the building design, alter structure, distort proportions, or change camera position.

Final look: A polished real-estate architectural competition render that feels like a billion-dollar development brochure."""
        
        # Use Flux Kontext Pro - designed for precise editing while preserving details
        # Try with input_image parameter name
        print(f"   Image URI starts with: {image_uri[:50]}...")
        
        output = run_with_retry(
            "black-forest-labs/flux-kontext-pro",
            {
                "prompt": prompt,
                "input_image": image_uri,  # Try input_image instead of image
                "aspect_ratio": "match_input_image",
                "output_format": "png",
                "safety_tolerance": 5,
            }
        )
        
        print(f"✅ Flux Kontext response received")
        print(f"   Output: {output}")
        
        # Get the result URL
        if isinstance(output, list) and len(output) > 0:
            image_url = str(output[0])
        else:
            image_url = str(output)
        
        print(f"   Downloading from: {image_url[:60]}...")
        
        # Download the result with retry logic
        image_bytes = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(image_url)
                    image_bytes = response.content
                    break
            except httpx.TimeoutException:
                print(f"   Download attempt {attempt + 1} timed out, retrying...")
                if attempt == max_retries - 1:
                    raise HTTPException(status_code=500, detail="Failed to download generated image after multiple attempts")
                await asyncio.sleep(1)
        
        if not image_bytes:
            raise HTTPException(status_code=500, detail="Failed to download generated image")
        
        print(f"   Downloaded: {len(image_bytes)} bytes")
        
        # Convert to base64
        result_base64 = base64.b64encode(image_bytes).decode()
        result_data_url = f"data:image/png;base64,{result_base64}"
        
        print("=" * 60)
        print("✅ RENDER COMPLETE")
        print("=" * 60)
        
        return RenderResponse(
            imageUrl=result_data_url,
            imageBase64=result_base64
        )
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/edit", response_model=RenderResponse)
async def edit_image(request: EditRequest):
    """
    Edit an existing render using natural language.
    Uses OpenAI gpt-image-1 or Replicate Flux based on configuration.
    
    Supports:
    - Masked editing (inpainting) when maskBase64 is provided
    - Whole-image editing when no mask
    - Quality tiers and style presets
    - Materials and scale specifications
    """
    
    # Parse quality and style
    quality = parse_quality(request.quality)
    style = parse_style(request.style)
    
    # Use OpenAI gpt-image-1 for editing
    if USE_OPENAI:
        print("=" * 60)
        print(f"✏️ EDIT REQUEST - OpenAI {OPENAI_IMAGE_MODEL}")
        print(f"   Quality: {quality.value}, Style: {style.value}")
        print(f"   Render Mode: {request.renderMode}")
        print("=" * 60)
        print(f"📝 Prompt: {request.prompt}")
        print(f"🖼️ Reference images: {len(request.referenceImages) if request.referenceImages else 0}")
        
        if not settings.openai_api_key:
            raise HTTPException(status_code=500, detail="OpenAI API not configured")
        
        try:
            result_url, result_base64 = await openai_service.edit_image(
                prompt=request.prompt,
                image_base64=request.imageBase64,
                mask_base64=None,  # No region selection for now
                model=OPENAI_IMAGE_MODEL,
                quality=quality,
                style_preset=style,
                reference_images=request.referenceImages,
                render_mode=request.renderMode,
            )
            
            return RenderResponse(
                imageUrl=result_url,
                imageBase64=result_base64,
            )
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
    
    # Fallback to Replicate/Flux
    print("=" * 60)
    print("✏️ EDIT REQUEST - Using Replicate")
    print("=" * 60)
    
    if not settings.replicate_api_token:
        raise HTTPException(status_code=500, detail="Replicate API not configured")
    
    try:
        # Prepare image
        print(f"📦 Preparing image...")
        image_data = base64.b64decode(request.imageBase64)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        
        # Resize if too large
        max_size = 1024
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        print(f"   Size: {image.size}")
        
        # Convert to data URI
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        image_uri = f"data:image/png;base64,{image_b64}"
        
        # Check if we have a mask for targeted inpainting
        if request.maskBase64:
            print(f"🎭 Mask provided - using SDXL Inpainting for precise editing")
            
            # Prepare mask
            mask_data = base64.b64decode(request.maskBase64)
            mask_image = Image.open(io.BytesIO(mask_data))
            
            # Resize mask to match image
            mask_image = mask_image.resize(image.size, Image.Resampling.LANCZOS)
            
            # Convert to grayscale and ensure white = edit area
            if mask_image.mode != 'L':
                mask_image = mask_image.convert('L')
            
            # Convert mask to data URI
            mask_buffer = io.BytesIO()
            mask_image.save(mask_buffer, format="PNG")
            mask_buffer.seek(0)
            mask_b64 = base64.b64encode(mask_buffer.getvalue()).decode()
            mask_uri = f"data:image/png;base64,{mask_b64}"
            
            print(f"   Prompt: {request.prompt}")
            
            # Use Flux Fill Pro for masked inpainting
            output = run_with_retry(
                "black-forest-labs/flux-fill-pro",
                {
                    "prompt": request.prompt,
                    "image": image_uri,
                    "mask": mask_uri,
                    "output_format": "png",
                }
            )
            
            print(f"✅ Flux Fill Pro inpainting response received")
        else:
            print(f"🚀 No mask - using Flux Kontext for general edit...")
            print(f"   Original prompt: {request.prompt}")
            
            # Wrap the prompt with STRONG preservation instructions
            enhanced_prompt = f"""CRITICAL: Make ONLY the specific change described below. 
Keep EVERYTHING else EXACTLY the same - same camera angle, same lighting, same perspective, same composition.

CHANGE TO MAKE: {request.prompt}

PRESERVE EXACTLY (do not alter in any way):
- The exact camera position and angle
- The perspective and focal length
- The lighting direction and color temperature  
- The sky and clouds
- The foreground elements (parking lot, road, landscaping)
- All elements not specifically mentioned in the change
- The overall composition and framing

This is a surgical edit - change ONLY what is specified, nothing else."""
            
            print(f"   Enhanced prompt: {enhanced_prompt[:200]}...")
            
            # Use Flux Kontext for general edits without mask
            output = run_with_retry(
                "black-forest-labs/flux-kontext-pro",
                {
                    "prompt": enhanced_prompt,
                    "input_image": image_uri,
                    "aspect_ratio": "match_input_image",
                    "output_format": "png",
                    "safety_tolerance": 5,
                }
            )
            
            print(f"✅ Flux Kontext edit response received")
        
        # Get the result URL
        if isinstance(output, list) and len(output) > 0:
            image_url = str(output[0])
        else:
            image_url = str(output)
        
        print(f"   Downloading from: {image_url[:60]}...")
        
        # Download the result with retry logic
        image_bytes = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(image_url)
                    image_bytes = response.content
                    break
            except httpx.TimeoutException:
                print(f"   Download attempt {attempt + 1} timed out, retrying...")
                if attempt == max_retries - 1:
                    raise HTTPException(status_code=500, detail="Failed to download generated image after multiple attempts")
                await asyncio.sleep(1)
        
        if not image_bytes:
            raise HTTPException(status_code=500, detail="Failed to download generated image")
        
        print(f"   Downloaded: {len(image_bytes)} bytes")
        
        # Convert to base64
        result_base64 = base64.b64encode(image_bytes).decode()
        result_data_url = f"data:image/png;base64,{result_base64}"
        
        print("=" * 60)
        print("✅ EDIT COMPLETE")
        print("=" * 60)
        
        return RenderResponse(
            imageUrl=result_data_url,
            imageBase64=result_base64
        )
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class PromptPreviewRequest(BaseModel):
    """Request to preview the prompt that will be generated"""
    prompt: str = Field(..., description="User's description of the change")
    style: str = Field("real_estate", description="Style preset")
    renderMode: str = Field("plan_to_render", alias="renderMode", description="Render mode: plan_to_render or pretty_render")
    
    class Config:
        populate_by_name = True


class PromptPreviewResponse(BaseModel):
    """Response with the generated prompt preview"""
    promptPreview: str


@router.post("/prompt-preview", response_model=PromptPreviewResponse)
async def get_prompt_preview(request: PromptPreviewRequest):
    """
    Get a preview of the prompt that will be sent to OpenAI.
    """
    style = parse_style(request.style)
    
    prompt_preview = openai_service.get_prompt_preview(
        user_description=request.prompt,
        style_preset=style,
        render_mode=request.renderMode,
    )
    
    return PromptPreviewResponse(promptPreview=prompt_preview)


class RedPenAnalyzeRequest(BaseModel):
    imageBase64: str = Field(..., alias="imageBase64")
    
    class Config:
        populate_by_name = True


class QuestionWithSuggestions(BaseModel):
    question: str
    suggestions: list[str]


class RedPenAnalyzeResponse(BaseModel):
    analysis: str
    questions: list[QuestionWithSuggestions]
    suggestedPrompt: str


class RedPenBuildPromptRequest(BaseModel):
    imageBase64: str = Field(..., alias="imageBase64")
    analysis: str
    questions: list[str]
    answers: list[str]
    
    class Config:
        populate_by_name = True


class RedPenBuildPromptResponse(BaseModel):
    finalPrompt: str
    reasoning: str


class RedPenExecuteRequest(BaseModel):
    imageBase64: str = Field(..., alias="imageBase64")
    confirmedPrompt: str = Field(..., alias="confirmedPrompt")
    
    class Config:
        populate_by_name = True


class RedPenExecuteResponse(BaseModel):
    imageUrl: str
    imageBase64: str


@router.post("/redpen/analyze", response_model=RedPenAnalyzeResponse)
async def analyze_redpen(request: RedPenAnalyzeRequest):
    """
    Step 1: Analyze red pen annotations and ask clarifying questions.
    """
    print("=" * 60)
    print("🖊️ RED PEN ANALYZE - Understanding annotations...")
    print("=" * 60)
    
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OpenAI API not configured")
    
    try:
        from openai import OpenAI
        import json
        
        # Decode image
        image_data = base64.b64decode(request.imageBase64)
        image = Image.open(io.BytesIO(image_data))
        
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        
        max_size = 1024
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        openai_client = OpenAI(api_key=settings.openai_api_key)
        
        # Ask GPT-4o to analyze AND generate questions
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analyze this architectural render with RED PEN annotations.

The user has drawn/written in red to show what they want to ADD or CHANGE.

Respond in this exact JSON format:
{
    "analysis": "Brief, friendly description of what you see in the red marks",
    "questions": [
        {
            "question": "The clarifying question?",
            "suggestions": ["Option 1", "Option 2", "Option 3"]
        },
        {
            "question": "Another question?",
            "suggestions": ["Option A", "Option B", "Option C"]
        }
    ],
    "suggestedPrompt": "A detailed prompt to implement the changes"
}

Ask 2-4 smart questions with 2-4 clickable suggestions each. Make suggestions specific and helpful.
Examples of good questions with suggestions:
- "What material for the poles?" -> ["Steel/metal", "Wooden", "Concrete"]
- "How many poles?" -> ["3-4 poles", "5-6 poles", "As many as needed"]
- "Cable style?" -> ["Modern industrial", "Traditional utility", "Minimal/clean"]

Be conversational and helpful like a design partner."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"}
                        }
                    ]
                }
            ],
            max_tokens=600
        )
        
        content = response.choices[0].message.content
        print(f"   Raw response: {content}")
        
        # Parse JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())
        
        print(f"   Analysis: {result['analysis']}")
        print(f"   Questions: {len(result['questions'])} questions")
        
        # Convert to proper format
        questions = [
            QuestionWithSuggestions(
                question=q["question"],
                suggestions=q["suggestions"]
            ) for q in result["questions"]
        ]
        
        return RedPenAnalyzeResponse(
            analysis=result["analysis"],
            questions=questions,
            suggestedPrompt=result["suggestedPrompt"]
        )
        
    except json.JSONDecodeError as e:
        print(f"❌ JSON parse error: {e}")
        # Fallback if JSON parsing fails
        return RedPenAnalyzeResponse(
            analysis="I can see red pen annotations on the image.",
            questions=["What would you like me to add based on your markings?"],
            suggestedPrompt="Add the elements shown in the red pen annotations"
        )
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/redpen/build-prompt", response_model=RedPenBuildPromptResponse)
async def build_redpen_prompt(request: RedPenBuildPromptRequest):
    """
    Step 2: GPT-4o takes the answers and builds the perfect prompt.
    """
    print("=" * 60)
    print("🖊️ RED PEN BUILD PROMPT - GPT-4o reasoning...")
    print("=" * 60)
    
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OpenAI API not configured")
    
    try:
        from openai import OpenAI
        import json
        
        # Build Q&A pairs
        qa_pairs = "\n".join([
            f"Q: {q}\nA: {a}" 
            for q, a in zip(request.questions, request.answers)
        ])
        
        print(f"   Analysis: {request.analysis}")
        print(f"   Q&A:\n{qa_pairs}")
        
        openai_client = OpenAI(api_key=settings.openai_api_key)
        
        # Prepare image for context
        image_data = base64.b64decode(request.imageBase64)
        image = Image.open(io.BytesIO(image_data))
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        max_size = 1024
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"""You analyzed this image with red pen annotations and asked clarifying questions.

Your initial analysis: {request.analysis}

Questions and user's answers:
{qa_pairs}

Now, based on the image and the user's answers, create the PERFECT prompt for an AI image generator to implement these changes.

Respond in JSON format:
{{
    "reasoning": "Brief explanation of how you're incorporating the answers",
    "finalPrompt": "The detailed, specific prompt to generate the changes. Be very precise about what to add, where, sizes, materials, style, etc."
}}

The prompt should tell the AI to remove the red pen marks and add the real elements in their place."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image_b64}"}
                        }
                    ]
                }
            ],
            max_tokens=400
        )
        
        content = response.choices[0].message.content
        print(f"   Raw response: {content}")
        
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        result = json.loads(content.strip())
        
        print(f"   Reasoning: {result['reasoning']}")
        print(f"   Final prompt: {result['finalPrompt']}")
        
        return RedPenBuildPromptResponse(
            finalPrompt=result["finalPrompt"],
            reasoning=result["reasoning"]
        )
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/redpen/execute", response_model=RedPenExecuteResponse)
async def execute_redpen(request: RedPenExecuteRequest):
    """
    Two-step execution:
    1. First convert to architectural render (preserve scene/angle)
    2. Then apply the red pen changes
    """
    print("=" * 60)
    print("🖊️ RED PEN EXECUTE - Two-Step Process")
    print("=" * 60)
    
    if not settings.replicate_api_token:
        raise HTTPException(status_code=500, detail="Replicate API not configured")
    
    try:
        # Decode image
        image_data = base64.b64decode(request.imageBase64)
        image = Image.open(io.BytesIO(image_data))
        
        if image.mode in ('RGBA', 'P', 'LA'):
            image = image.convert('RGB')
        
        max_size = 1024
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        image_b64 = base64.b64encode(buffer.getvalue()).decode()
        image_uri = f"data:image/png;base64,{image_b64}"
        
        # === STEP 1: Convert to architectural render first ===
        print("🎨 Step 1: Converting to architectural render...")
        print("   (Preserving exact scene, angle, and composition)")
        
        render_prompt = "Transform this photo into a clean professional architectural visualization render. Keep the EXACT same scene, camera angle, perspective, and all elements in their exact positions. Just change the style to a polished 3D architectural render with clean materials and professional lighting."
        
        render_output = run_with_retry(
            "black-forest-labs/flux-kontext-pro",
            {
                "prompt": render_prompt,
                "input_image": image_uri,
                "aspect_ratio": "match_input_image",
                "output_format": "png",
                "safety_tolerance": 5,
            }
        )
        
        print("   ✅ Render conversion complete")
        
        # Get the rendered image
        if isinstance(render_output, list) and len(render_output) > 0:
            render_url = str(render_output[0])
        else:
            render_url = str(render_output)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(render_url)
            render_bytes = response.content
        
        render_b64 = base64.b64encode(render_bytes).decode()
        render_uri = f"data:image/png;base64,{render_b64}"
        
        # === STEP 2: Apply the red pen changes ===
        print("🖊️ Step 2: Applying red pen changes...")
        print(f"   Changes: {request.confirmedPrompt[:80]}...")
        
        # Now apply changes to the RENDERED image
        change_prompt = f"{request.confirmedPrompt}. Keep everything else exactly the same. Maintain the professional architectural render style."
        
        final_output = run_with_retry(
            "black-forest-labs/flux-kontext-pro",
            {
                "prompt": change_prompt,
                "input_image": render_uri,
                "aspect_ratio": "match_input_image",
                "output_format": "png",
                "safety_tolerance": 5,
            }
        )
        
        print("   ✅ Changes applied")
        
        if isinstance(final_output, list) and len(final_output) > 0:
            final_url = str(final_output[0])
        else:
            final_url = str(final_output)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(final_url)
            final_bytes = response.content
        
        result_base64 = base64.b64encode(final_bytes).decode()
        result_data_url = f"data:image/png;base64,{result_base64}"
        
        print("=" * 60)
        print("✅ RED PEN EXECUTION COMPLETE (2 steps)")
        print("=" * 60)
        
        return RedPenExecuteResponse(
            imageUrl=result_data_url,
            imageBase64=result_base64
        )
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
