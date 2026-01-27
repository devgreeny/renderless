import base64
from openai import OpenAI
import openai
from typing import Optional, Literal
import io
from PIL import Image, ImageFilter
import asyncio
from functools import partial
from enum import Enum
import numpy as np
import time
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from config import settings


# =============================================================================
# PROMPT TEMPLATES - Structured for optimal gpt-image-1 results
# =============================================================================

class RenderQuality(str, Enum):
    """Quality tiers for image generation"""
    DRAFT = "draft"      # Fast, lower fidelity, cheaper
    STANDARD = "standard" # Default balance
    HIGH = "high"        # High fidelity, HD output


class StylePreset(str, Enum):
    """Architectural style presets"""
    REAL_ESTATE = "real_estate"
    INDUSTRIAL = "industrial"
    EVENING = "evening"
    MODERN = "modern"
    CUSTOM = "custom"


STYLE_PRESET_PROMPTS = {
    StylePreset.REAL_ESTATE: "Bright daylight lighting, clean professional landscaping, clear blue sky with subtle clouds, high-end real estate marketing quality",
    StylePreset.INDUSTRIAL: "Overcast sky, utilitarian industrial aesthetic, functional lighting, practical materials visible",
    StylePreset.EVENING: "Golden hour warm lighting, long shadows, warm amber tones, dramatic sky colors",
    StylePreset.MODERN: "Clean minimalist aesthetic, neutral tones, contemporary materials like glass and steel, sharp geometric forms",
    StylePreset.CUSTOM: "",
}


def build_edit_prompt(
    user_description: str,
    style_preset: StylePreset = StylePreset.REAL_ESTATE,
    num_reference_images: int = 0,
    render_mode: str = "plan_to_render",
) -> str:
    """
    Build a structured prompt for image editing.
    
    Two modes:
    - plan_to_render: Keep everything accurate to original, just make it photorealistic
    - pretty_render: Creative freedom for marketing-quality visualization
    """
    # Get style description
    style_desc = STYLE_PRESET_PROMPTS.get(style_preset, "")
    
    # Reference image instructions
    if num_reference_images > 0:
        ref_instruction = f"""
REFERENCE IMAGES: You have been provided {num_reference_images} reference image(s).
- Image 1 is the MAIN image to edit
- Images 2-{num_reference_images + 1} are REFERENCE images showing design inspiration
- Match the style, look, and details from the reference images"""
    else:
        ref_instruction = ""
    
    # PRETTY RENDER MODE: Creative, marketing-focused
    if render_mode == "pretty_render":
        prompt = f"""Create a stunning, professional architectural marketing render inspired by the uploaded photo.

REQUESTED CHANGES: {user_description}
{ref_instruction}

CREATIVE DIRECTION:
- Use the photo as INSPIRATION while keeping the essential design
- Create an aspirational, polished version of this scene
- {style_desc}
- Professional marketing/real estate quality
- Beautiful, dramatic lighting

STYLE GOALS:
- Magazine-quality architectural visualization
- Lifestyle imagery that sells the vision
- Polished, aspirational, beautiful
- The kind of render a high-end developer would use

Feel free to:
- Enhance landscaping and surroundings
- Add life and atmosphere to the scene
- Improve materials and finishes
- Create dramatic, beautiful lighting
- Optimize composition for visual impact

OUTPUT: A breathtaking architectural marketing render that makes viewers want to be there."""
        return prompt.strip()
    
    # PLAN TO RENDER MODE: Accurate, preserving geometry exactly
    prompt = f"""Transform this architectural plan/photo into a photorealistic render.

REQUESTED CHANGES: {user_description}
{ref_instruction}

CRITICAL ACCURACY REQUIREMENTS:
- Keep the EXACT same camera angle and perspective
- Preserve ALL building geometry, massing, and proportions
- Maintain window placement, rooflines, and architectural details
- Do NOT move, resize, or modify any structural elements

STYLE:
- {style_desc}
- Clear, professional lighting
- Sharp, realistic materials
- Clean, well-maintained appearance

DO NOT:
- Change the camera angle or perspective
- Modify building geometry or proportions
- Move or resize any architectural elements
- Distort or warp any structures
- Darken the overall image

OUTPUT: An accurate, photorealistic render that looks exactly like the input, just enhanced to look like a professional architectural visualization."""

    return prompt.strip()


def build_render_prompt(style_preset: StylePreset = StylePreset.REAL_ESTATE) -> str:
    """
    Build a prompt for photo-to-render transformation.
    Emphasizes preservation of exact geometry while transforming style.
    """
    # Core prompt optimized for photo-to-render transformation
    return """Using the uploaded photo as the exact reference, preserve the camera angle, perspective, scale, and building geometry with absolute accuracy.

Do not change the architecture, massing, window placement, rooflines, or site layout.

Transform the photo into a high-end real estate marketing render with:
- Bright, clear, sunny daytime lighting
- Blue sky with soft natural clouds
- Balanced exposure and professional architectural photography color grading
- Clean, modern, well-maintained appearance
- Sharp detail and crisp materials
- Subtle realism with no artificial distortion

Improve the overall visual quality by:
- Enhancing the brick, concrete, and glass so they look freshly cleaned and well maintained
- Removing visual noise, haze, and dullness
- Improving contrast, clarity, and color balance
- Making the scene feel inviting, high-value, and professionally photographed

The final image should look like a premium architectural marketing render of the existing site, not a redesign or a new building."""


class OpenAIService:
    """
    OpenAI Image Service using gpt-image-1
    
    This uses OpenAI's unified image model that handles:
    - Image editing with masks (inpainting)
    - Style transfer
    - Object addition/removal
    - Re-lighting
    - All while preserving camera pose and geometry
    """
    
    def __init__(self):
        if settings.openai_api_key:
            self.client = OpenAI(api_key=settings.openai_api_key)
        else:
            self.client = None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((openai.RateLimitError, openai.APIConnectionError)),
        reraise=True,
    )
    def _call_images_edit(self, **kwargs) -> any:
        """
        Call OpenAI images.edit with retry logic for transient errors.
        
        Retries on:
        - RateLimitError (429) - with exponential backoff
        - APIConnectionError - network issues
        
        Does NOT retry on:
        - BadRequestError (400) - invalid inputs
        - AuthenticationError (401) - bad API key
        """
        try:
            return self.client.images.edit(**kwargs)
        except openai.BadRequestError as e:
            # Don't retry - user needs to fix their input
            print(f"❌ OpenAI BadRequest: {e}")
            raise ValueError(f"Image editing failed: {str(e)}")
        except openai.AuthenticationError as e:
            print(f"❌ OpenAI Auth Error: {e}")
            raise ValueError("OpenAI API key is invalid")
        except openai.RateLimitError as e:
            print(f"⚠️ Rate limited, retrying... {e}")
            raise  # Will be retried
        except openai.APIConnectionError as e:
            print(f"⚠️ Connection error, retrying... {e}")
            raise  # Will be retried
    
    def _prepare_image_bytes(self, image_base64: str, max_size: int = 2048) -> bytes:
        """
        Prepare image for OpenAI Images API.
        Returns PNG bytes.
        """
        # Decode base64
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGBA (required for edit endpoint with masks)
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        
        # Resize if too large (keep aspect ratio)
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        # Convert to bytes
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)
        
        return buffer.read(), image.size
    
    def _prepare_mask_bytes(self, mask_base64: str, target_size: tuple, feather_radius: int = 2) -> bytes:
        """
        Prepare mask for OpenAI Images API using NumPy (10-100x faster).
        
        OpenAI expects: transparent areas = edit, opaque areas = keep
        Our mask: white = edit, black = keep
        
        Args:
            mask_base64: Base64 encoded mask image
            target_size: Size to resize mask to (width, height)
            feather_radius: Blur radius for edge feathering (0 to disable)
        """
        start_time = time.time()
        
        # Decode base64
        mask_data = base64.b64decode(mask_base64)
        mask = Image.open(io.BytesIO(mask_data))
        
        # Resize to match image
        mask = mask.resize(target_size, Image.Resampling.LANCZOS)
        
        # Convert to RGB for brightness calculation
        if mask.mode != "RGB":
            mask = mask.convert("RGB")
        
        # Convert to NumPy array for fast processing
        arr = np.array(mask)
        
        # Calculate brightness (mean of RGB channels) - vectorized operation
        brightness = arr.mean(axis=2)
        
        # Create alpha channel: white (edit) -> 0 (transparent), black (keep) -> 255 (opaque)
        alpha = np.where(brightness > 128, 0, 255).astype(np.uint8)
        
        # Optional: feather edges for smoother blending
        if feather_radius > 0:
            alpha_img = Image.fromarray(alpha, mode='L')
            alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=feather_radius))
            alpha = np.array(alpha_img)
        
        # Create RGBA image with black RGB and computed alpha
        rgba = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
        rgba[:, :, 3] = alpha  # Set alpha channel
        
        # Convert back to PIL Image
        result = Image.fromarray(rgba, mode='RGBA')
        
        # Convert to bytes
        buffer = io.BytesIO()
        result.save(buffer, format="PNG")
        buffer.seek(0)
        
        elapsed = time.time() - start_time
        print(f"   Mask processed in {elapsed*1000:.1f}ms (NumPy accelerated)")
        
        return buffer.read()
    
    def _edit_image_sync(
        self,
        prompt: str,
        image_base64: str,
        mask_base64: Optional[str] = None,
        model: str = "gpt-image-1",
        quality: RenderQuality = RenderQuality.STANDARD,
        style_preset: StylePreset = StylePreset.REAL_ESTATE,
        reference_images: Optional[list[str]] = None,
        render_mode: str = "plan_to_render",
    ) -> tuple[str, str]:
        """
        Edit an image using OpenAI's gpt-image-1 model.
        
        This is the core function that does vision-conditioned image editing:
        - If mask provided: edits only the masked region (inpainting)
        - If no mask: applies changes to the whole image
        - Supports up to 10 input images (main + references)
        - Supports 'edit' (strict) and 'reimagine' (creative) modes
        - Supports lifestyle presets (marketing, clean, evening, community)
        
        Args:
            prompt: User's description of the desired change
            image_base64: Base64 encoded source image
            mask_base64: Optional mask (white=edit, black=keep)
            model: OpenAI model to use
            quality: RenderQuality tier (draft/standard/high)
            style_preset: Architectural style preset
            materials: List of materials to use
            scale: Scale description (e.g., "40 feet tall")
            reference_images: Optional list of reference image base64 strings
            creative_mode: 'edit' for strict preservation, 'reimagine' for creative interpretation
            lifestyle_preset: Optional lifestyle preset (marketing, clean, evening, community)
        """
        if not self.client:
            raise ValueError("OpenAI API key not configured")
        
        print("=" * 60)
        mode_emoji = "✨" if render_mode == "pretty_render" else "📐"
        print(f"{mode_emoji} OPENAI IMAGE {render_mode.upper()} - {model} ({quality.value} quality)")
        print("=" * 60)
        
        # Prepare the main image
        image_bytes, image_size = self._prepare_image_bytes(image_base64)
        print(f"📦 Main image prepared: {image_size}")
        
        # Prepare reference images if provided (up to 9 refs + 1 main = 10 total)
        ref_image_files = []
        if reference_images:
            for i, ref_base64 in enumerate(reference_images[:9]):
                ref_bytes, _ = self._prepare_image_bytes(ref_base64)
                ref_file = (f"reference_{i+1}.png", ref_bytes, "image/png")
                ref_image_files.append(ref_file)
            print(f"📦 Reference images prepared: {len(ref_image_files)}")
        
        # Build structured prompt using template
        full_prompt = build_edit_prompt(
            user_description=prompt,
            style_preset=style_preset,
            num_reference_images=len(ref_image_files),
            render_mode=render_mode,
        )
        print(f"📝 Prompt preview:\n{full_prompt[:200]}...")
        
        # Determine size based on model - ALWAYS use max size for quality
        if model == "dall-e-2":
            size = "512x512"
        else:
            # Always use largest supported size to minimize quality loss
            size = "1536x1024"  # Max landscape size for gpt-image-1
        
        # Common API parameters
        api_params = {
            "model": model,
            "prompt": full_prompt,
            "n": 1,
            "size": size,
            "output_format": "png",  # CRITICAL: Lossless output format
        }
        
        # ALWAYS use high quality and high fidelity for gpt-image models
        if model.startswith("gpt-image"):
            api_params["quality"] = "high"  # Max quality (options: low, medium, high, auto)
            api_params["input_fidelity"] = "high"  # Preserve details
            print("🔒 Quality: HIGH | Input fidelity: HIGH | Output: PNG (lossless)")
        
        # Create main image file tuple
        main_image_file = ("image.png", image_bytes, "image/png")
        
        # Build image array: main image first, then references
        if ref_image_files:
            # Multiple images: pass as array
            image_array = [main_image_file] + ref_image_files
            api_params["image"] = image_array
            print(f"🖼️ Passing {len(image_array)} images to API (1 main + {len(ref_image_files)} references)")
        else:
            # Single image
            api_params["image"] = main_image_file
        
        if mask_base64:
            # Use edit endpoint with mask for targeted inpainting
            print("🎭 Using masked edit (inpainting)")
            mask_bytes = self._prepare_mask_bytes(mask_base64, image_size)
            mask_file = ("mask.png", mask_bytes, "image/png")
            api_params["mask"] = mask_file
        else:
            print("🖼️ Using whole-image edit")
        
        response = self._call_images_edit(**api_params)
        
        # Get the result
        result = response.data[0]
        
        # Handle both URL and b64_json responses
        if hasattr(result, 'b64_json') and result.b64_json:
            result_base64 = result.b64_json
            result_url = f"data:image/png;base64,{result_base64}"
        elif hasattr(result, 'url') and result.url:
            # Download the image from URL
            import httpx
            with httpx.Client(timeout=30.0) as client:
                img_response = client.get(result.url)
                img_bytes = img_response.content
            result_base64 = base64.b64encode(img_bytes).decode()
            result_url = f"data:image/png;base64,{result_base64}"
        else:
            raise ValueError("No image data in response")
        
        print("=" * 60)
        print("✅ OPENAI EDIT COMPLETE")
        print("=" * 60)
        
        return result_url, result_base64
    
    def _render_image_sync(
        self,
        image_base64: str,
        model: str = "gpt-image-1",
        quality: RenderQuality = RenderQuality.STANDARD,
        style_preset: StylePreset = StylePreset.REAL_ESTATE,
    ) -> tuple[str, str]:
        """
        Convert a photo to an architectural render style.
        Uses gpt-image-1 with a render-focused prompt.
        
        Args:
            image_base64: Base64 encoded source image
            model: OpenAI model to use
            quality: RenderQuality tier (draft/standard/high)
            style_preset: Architectural style preset
        """
        if not self.client:
            raise ValueError("OpenAI API key not configured")
        
        print("=" * 60)
        print(f"🏛️ OPENAI RENDER - Photo to Arch Viz ({model}, {quality.value})")
        print("=" * 60)
        
        # Prepare the image
        image_bytes, image_size = self._prepare_image_bytes(image_base64)
        print(f"📦 Image prepared: {image_size}")
        
        # Build prompt using template
        render_prompt = build_render_prompt(style_preset)
        print(f"🎨 Style preset: {style_preset.value}")

        # Create file tuple with proper MIME type
        image_file = ("image.png", image_bytes, "image/png")
        
        # Determine size based on model - ALWAYS use max size for quality
        if model == "dall-e-2":
            size = "512x512"
        else:
            # Always use largest supported size to minimize quality loss
            size = "1536x1024"  # Max landscape size for gpt-image-1
        
        # Build API parameters
        api_params = {
            "model": model,
            "image": image_file,
            "prompt": render_prompt,
            "n": 1,
            "size": size,
            "output_format": "png",  # CRITICAL: Lossless output format
        }
        
        # ALWAYS use high quality and high fidelity for gpt-image models
        if model.startswith("gpt-image"):
            api_params["quality"] = "high"  # Max quality (options: low, medium, high, auto)
            api_params["input_fidelity"] = "high"  # Preserve details
            print("🔒 Quality: HIGH | Input fidelity: HIGH | Output: PNG (lossless)")

        response = self._call_images_edit(**api_params)
        
        # Get the result
        result = response.data[0]
        
        if hasattr(result, 'b64_json') and result.b64_json:
            result_base64 = result.b64_json
            result_url = f"data:image/png;base64,{result_base64}"
        elif hasattr(result, 'url') and result.url:
            import httpx
            with httpx.Client(timeout=30.0) as client:
                img_response = client.get(result.url)
                img_bytes = img_response.content
            result_base64 = base64.b64encode(img_bytes).decode()
            result_url = f"data:image/png;base64,{result_base64}"
        else:
            raise ValueError("No image data in response")
        
        print("=" * 60)
        print("✅ OPENAI RENDER COMPLETE")
        print("=" * 60)
        
        return result_url, result_base64
    
    def get_prompt_preview(
        self,
        user_description: str,
        style_preset: StylePreset = StylePreset.REAL_ESTATE,
        render_mode: str = "plan_to_render",
    ) -> str:
        """
        Get a preview of the prompt that will be sent to OpenAI.
        """
        return build_edit_prompt(
            user_description=user_description,
            style_preset=style_preset,
            render_mode=render_mode,
        )
    
    async def edit_image(
        self,
        prompt: str,
        image_base64: str,
        mask_base64: Optional[str] = None,
        model: str = "gpt-image-1",
        quality: RenderQuality = RenderQuality.STANDARD,
        style_preset: StylePreset = StylePreset.REAL_ESTATE,
        reference_images: Optional[list[str]] = None,
        render_mode: str = "plan_to_render",
    ) -> tuple[str, str]:
        """
        Edit an image using OpenAI's image models (async wrapper).
        
        Modes:
        - plan_to_render: Accurate preservation of geometry
        - pretty_render: Creative marketing-quality visualization
        
        Returns (image_url, image_base64)
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(
                self._edit_image_sync, 
                prompt, 
                image_base64, 
                mask_base64, 
                model,
                quality,
                style_preset,
                reference_images,
                render_mode,
            )
        )
    
    async def render_image(
        self,
        image_base64: str,
        model: str = "gpt-image-1",
        quality: RenderQuality = RenderQuality.STANDARD,
        style_preset: StylePreset = StylePreset.REAL_ESTATE,
    ) -> tuple[str, str]:
        """
        Convert photo to architectural render using OpenAI's image models (async wrapper).
        Returns (image_url, image_base64)
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(self._render_image_sync, image_base64, model, quality, style_preset)
        )
    
    def _analyze_sync(self, image_base64: str, prompt: str) -> str:
        """Analyze an image using GPT-4o vision"""
        if not self.client:
            raise ValueError("OpenAI API key not configured")
            
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500
        )
        
        return response.choices[0].message.content

    async def analyze_image(self, image_base64: str, prompt: str) -> str:
        """Use GPT-4o to analyze an image (async wrapper)"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(self._analyze_sync, image_base64, prompt)
        )


# Singleton instance
openai_service = OpenAIService()
