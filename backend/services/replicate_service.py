import replicate
import replicate.exceptions
import base64
import httpx
from typing import Optional
import io
import time
import re
from PIL import Image
import asyncio
from functools import partial

from config import settings


def run_with_retry(
    model: str,
    input_params: dict,
    max_retries: int = 5,
    initial_delay: float = 2.0,
) -> any:
    """
    Run a Replicate model with automatic retry on rate limit (429) errors.
    Uses exponential backoff with jitter.
    
    Args:
        model: The Replicate model identifier
        input_params: Input parameters for the model
        max_retries: Maximum number of retry attempts (default 5)
        initial_delay: Initial delay in seconds before first retry (default 2.0)
    
    Returns:
        The model output
    
    Raises:
        replicate.exceptions.ReplicateError: If all retries are exhausted
    """
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            return replicate.run(model, input=input_params)
        except replicate.exceptions.ReplicateError as e:
            last_error = e
            error_str = str(e)
            
            # Check if this is a rate limit error (429)
            if "429" in error_str or "throttled" in error_str.lower() or "rate limit" in error_str.lower():
                if attempt < max_retries:
                    # Parse reset time from error message if available
                    reset_match = re.search(r'resets in ~?(\d+)s', error_str)
                    if reset_match:
                        wait_time = int(reset_match.group(1)) + 1  # Add 1s buffer
                    else:
                        # Exponential backoff: 2s, 4s, 8s, 16s, 32s
                        wait_time = initial_delay * (2 ** attempt)
                    
                    # Cap at 60 seconds
                    wait_time = min(wait_time, 60)
                    
                    print(f"⏳ Rate limited (attempt {attempt + 1}/{max_retries + 1}). Waiting {wait_time:.1f}s before retry...")
                    time.sleep(wait_time)
                    continue
            
            # Not a rate limit error, or we've exhausted retries - re-raise
            raise
    
    # If we've exhausted all retries, raise the last error
    raise last_error


async def run_with_retry_async(
    model: str,
    input_params: dict,
    max_retries: int = 5,
    initial_delay: float = 2.0,
) -> any:
    """
    Async version of run_with_retry. Runs the synchronous Replicate call
    in a thread pool to avoid blocking.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        partial(run_with_retry, model, input_params, max_retries, initial_delay)
    )


class ReplicateService:
    def __init__(self):
        self.configured = False
        if settings.replicate_api_token:
            # Set the API token for replicate
            import os
            os.environ["REPLICATE_API_TOKEN"] = settings.replicate_api_token
            self.configured = True
    
    def _image_to_data_uri(self, image_base64: str) -> str:
        """Convert base64 to data URI for Replicate"""
        return f"data:image/png;base64,{image_base64}"
    
    def _prepare_image(self, image_base64: str, max_size: int = 1024) -> tuple[str, int, int]:
        """Prepare and resize image, return as data URI with dimensions"""
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if needed (Flux doesn't like RGBA)
        if image.mode in ('RGBA', 'P'):
            image = image.convert('RGB')
        
        # Resize if too large
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        width, height = image.size
        
        # Convert back to base64
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=95)
        new_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/jpeg;base64,{new_base64}", width, height
    
    def _run_replicate_sync(self, model: str, input_params: dict):
        """Run replicate synchronously with retry logic (will be wrapped in async executor)"""
        return run_with_retry(model, input_params)
    
    async def generate_image(
        self,
        prompt: str,
        image_base64: str,
        strength: float = 0.75,
        style: str = "architectural"
    ) -> tuple[str, str]:
        """
        Generate image using SDXL img2img on Replicate.
        Uses the actual image as starting point!
        
        Args:
            prompt: What to generate/modify
            image_base64: The reference image
            strength: How much to change (0.0 = no change, 1.0 = complete change)
            style: Style preset
        
        Returns:
            (image_url, image_base64)
        """
        if not self.configured:
            raise ValueError("Replicate API token not configured. Set REPLICATE_API_TOKEN in .env")
        
        # Prepare the image and get dimensions
        image_uri, width, height = self._prepare_image(image_base64)
        
        # Enhance prompt for architectural renders
        style_additions = {
            "architectural": "professional architectural 3D render, clean lines, photorealistic materials, high quality visualization",
            "photorealistic": "photorealistic, high quality, 8k resolution, sharp details",
            "concept": "architectural concept art, artistic visualization, professional rendering",
            "technical": "technical architectural drawing, precise details, clean lines"
        }
        
        enhanced_prompt = f"{prompt}. {style_additions.get(style, style_additions['architectural'])}"
        
        print(f"🎨 Replicate: Using SDXL img2img...")
        print(f"   Prompt: {enhanced_prompt[:100]}...")
        print(f"   Strength: {strength} (lower = more faithful to original)")
        print(f"   Dimensions: {width}x{height}")
        print(f"   Image URI length: {len(image_uri)} chars")
        print(f"   Image URI prefix: {image_uri[:50]}...")
        
        # Use stability-ai/sdxl with img2img mode
        # This ACTUALLY uses your image as the starting point
        loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(
            None,
            partial(
                self._run_replicate_sync,
                "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
                {
                    "prompt": enhanced_prompt,
                    "image": image_uri,  # THIS is the key - init image
                    "prompt_strength": strength,  # How much to deviate from init image
                    "num_outputs": 1,
                    "scheduler": "K_EULER",
                    "num_inference_steps": 30,
                    "guidance_scale": 7.5,
                    "negative_prompt": "blurry, low quality, distorted, ugly, bad proportions, unrealistic",
                    "refine": "expert_ensemble_refiner",
                    "refine_steps": 10,
                }
            )
        )
        
        print(f"✅ Replicate: SDXL img2img complete!")
        
        # Output is a list of URLs
        if isinstance(output, list) and len(output) > 0:
            image_url = str(output[0])
        else:
            image_url = str(output)
        
        # Download the image
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            image_bytes = response.content
        
        # Convert to base64
        image_base64_result = base64.b64encode(image_bytes).decode()
        
        # Create data URL
        data_url = f"data:image/png;base64,{image_base64_result}"
        
        return data_url, image_base64_result
    
    async def style_transfer(
        self,
        prompt: str,
        image_base64: str,
    ) -> tuple[str, str]:
        """
        Pure style transfer using ControlNet Canny.
        Extracts edges from your photo and generates a render following those EXACT edges.
        This gives 1:1 structure preservation.
        """
        if not self.configured:
            raise ValueError("Replicate API token not configured. Set REPLICATE_API_TOKEN in .env")
        
        image_uri, width, height = self._prepare_image(image_base64)
        
        print(f"🎨 Replicate: Style transfer with ControlNet Canny...")
        print(f"   This preserves EXACT edges and structure")
        print(f"   Prompt: {prompt[:80]}...")
        
        # Use a modern SDXL ControlNet model
        loop = asyncio.get_event_loop()
        output = await loop.run_in_executor(
            None,
            partial(
                self._run_replicate_sync,
                "xlabs-ai/flux-dev-controlnet:f2c31c31d81278a91b2447a304dae654c64a5d5a70340fba811bb1cbd41019a2",
                {
                    "prompt": prompt,
                    "control_image": image_uri,
                    "control_type": "canny",
                    "control_strength": 0.9,  # HIGH - follow edges closely
                    "num_outputs": 1,
                    "guidance_scale": 3.5,
                    "num_inference_steps": 28,
                    "output_format": "png",
                }
            )
        )
        
        if isinstance(output, list) and len(output) > 0:
            image_url = str(output[0])
        else:
            image_url = str(output)
        
        print(f"   Output URL: {image_url[:50]}...")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            image_bytes = response.content
        
        image_base64_result = base64.b64encode(image_bytes).decode()
        data_url = f"data:image/png;base64,{image_base64_result}"
        
        print("✅ Replicate: ControlNet style transfer complete!")
        
        return data_url, image_base64_result


# Singleton instance
replicate_service = ReplicateService()

