import type { GenerationRequest, GenerationResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function generateImage(
  request: GenerationRequest
): Promise<GenerationResponse> {
  const response = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Generation failed' }));
    throw new Error(error.detail || 'Generation failed');
  }
  
  return response.json();
}

export interface ReplicateGenerationRequest {
  prompt: string;
  imageBase64: string;
  strength?: number; // 0.0 = keep original, 1.0 = full regeneration
  style?: string;
}

export async function generateWithReplicate(
  request: ReplicateGenerationRequest
): Promise<GenerationResponse> {
  const response = await fetch(`${API_BASE}/api/generate/replicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Generation failed' }));
    throw new Error(error.detail || 'Generation failed');
  }
  
  return response.json();
}

export interface StyleTransferRequest {
  prompt: string;
  imageBase64: string;
}

export async function styleTransfer(
  request: StyleTransferRequest
): Promise<GenerationResponse> {
  const response = await fetch(`${API_BASE}/api/generate/style-transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Style transfer failed' }));
    throw new Error(error.detail || 'Style transfer failed');
  }
  
  return response.json();
}

export async function generateWithMask(
  imageBase64: string,
  maskBase64: string,
  prompt: string
): Promise<GenerationResponse> {
  return generateImage({
    prompt,
    imageBase64,
    maskBase64,
  });
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Utility to convert File to base64
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Utility to convert canvas to base64
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

// Utility to load image and get dimensions
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Create a blob URL from base64
export function base64ToObjectUrl(base64: string, mimeType = 'image/png'): string {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

