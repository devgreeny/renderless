from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class GenerationStyle(str, Enum):
    PHOTOREALISTIC = "photorealistic"
    ARCHITECTURAL = "architectural"
    SKETCH = "sketch"
    MODERN = "modern"
    MINIMALIST = "minimalist"


class GenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    image_base64: str = Field(..., alias="imageBase64")
    mask_base64: Optional[str] = Field(None, alias="maskBase64")
    style: Optional[GenerationStyle] = GenerationStyle.PHOTOREALISTIC
    
    class Config:
        populate_by_name = True


class GenerationResponse(BaseModel):
    image_url: str = Field(..., alias="imageUrl")
    image_base64: str = Field(..., alias="imageBase64")
    
    class Config:
        populate_by_name = True
        by_alias = True


class HealthResponse(BaseModel):
    status: str
    version: str


class ErrorResponse(BaseModel):
    detail: str

