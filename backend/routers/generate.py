from fastapi import APIRouter, HTTPException
from models.schemas import GenerationRequest, GenerationResponse, ErrorResponse
from services.openai_service import openai_service
from services.replicate_service import replicate_service
import traceback

router = APIRouter(prefix="/api", tags=["generation"])


@router.post(
    "/generate",
    response_model=GenerationResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def generate_image(request: GenerationRequest):
    """
    Generate or edit an image using AI.
    
    - If mask_base64 is provided, performs inpainting (edits only the masked region)
    - If no mask, generates a new variation based on the input image
    """
    print(f"📥 Received generate request: prompt='{request.prompt[:50]}...'")
    print(f"   Image size: {len(request.image_base64)} chars")
    print(f"   Mask: {'Yes' if request.mask_base64 else 'No'}")
    
    try:
        image_url, image_base64 = await openai_service.generate_image(
            prompt=request.prompt,
            image_base64=request.image_base64,
            mask_base64=request.mask_base64,
            style=request.style.value if request.style else "photorealistic"
        )
        
        print(f"📤 Returning generated image: {len(image_base64)} chars")
        
        return GenerationResponse(
            imageUrl=image_url,
            imageBase64=image_base64
        )
    except Exception as e:
        print(f"❌ Generation error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel, Field
from typing import Optional

class AnalyzeRequest(BaseModel):
    image_base64: str
    prompt: str = "Describe this architectural image"

class ReplicateGenerateRequest(BaseModel):
    prompt: str
    image_base64: str = Field(..., alias="imageBase64")
    strength: float = 0.75  # 0.0 = keep original, 1.0 = full generation
    style: str = "architectural"
    
    class Config:
        populate_by_name = True

@router.post("/analyze")
async def analyze_image(request: AnalyzeRequest):
    """
    Analyze an image using GPT-4V.
    Useful for understanding the content before editing.
    """
    try:
        print(f"🔍 Analyzing image with prompt: {request.prompt[:50]}...")
        analysis = await openai_service.analyze_image(request.image_base64, request.prompt)
        print(f"✅ Analysis complete: {analysis[:100]}...")
        return {"analysis": analysis}
    except Exception as e:
        print(f"❌ Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/generate/replicate",
    response_model=GenerationResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def generate_with_replicate(request: ReplicateGenerateRequest):
    """
    Generate image using Replicate SDXL img2img.
    Uses your image as starting point.
    """
    print(f"📥 Replicate generate request: prompt='{request.prompt[:50]}...'")
    print(f"   Image size: {len(request.image_base64)} chars")
    print(f"   Strength: {request.strength}")
    
    try:
        image_url, image_base64 = await replicate_service.generate_image(
            prompt=request.prompt,
            image_base64=request.image_base64,
            strength=request.strength,
            style=request.style
        )
        
        print(f"📤 Returning Replicate generated image")
        
        return GenerationResponse(
            imageUrl=image_url,
            imageBase64=image_base64
        )
    except Exception as e:
        print(f"❌ Replicate generation error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class StyleTransferRequest(BaseModel):
    prompt: str
    image_base64: str = Field(..., alias="imageBase64")
    
    class Config:
        populate_by_name = True


@router.post(
    "/generate/style-transfer",
    response_model=GenerationResponse,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def style_transfer(request: StyleTransferRequest):
    """
    Pure style transfer using ControlNet.
    Preserves EXACT structure/edges, only changes style.
    This is for 1:1 photo-to-render conversion.
    """
    print(f"📥 Style transfer request: prompt='{request.prompt[:50]}...'")
    print(f"   Image size: {len(request.image_base64)} chars")
    print(f"   Mode: ControlNet Canny (edge preservation)")
    
    try:
        image_url, image_base64 = await replicate_service.style_transfer(
            prompt=request.prompt,
            image_base64=request.image_base64,
        )
        
        print(f"📤 Returning style-transferred image")
        
        return GenerationResponse(
            imageUrl=image_url,
            imageBase64=image_base64
        )
    except Exception as e:
        print(f"❌ Style transfer error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

