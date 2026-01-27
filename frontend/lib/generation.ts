import { generateImage, canvasToBase64 } from './api';
import type { Mask, Version } from './types';

interface GenerationOptions {
  prompt: string;
  currentVersion: Version;
  mask: Mask | null;
  onSuccess: (imageUrl: string, imageBase64: string) => void;
  onError: (error: Error) => void;
  onStart: () => void;
  onEnd: () => void;
}

export async function generateWithCurrentState({
  prompt,
  currentVersion,
  mask,
  onSuccess,
  onError,
  onStart,
  onEnd,
}: GenerationOptions) {
  onStart();
  
  try {
    // Extract base64 from current version's data URL
    const imageBase64 = currentVersion.imageUrl.includes(',')
      ? currentVersion.imageUrl.split(',')[1]
      : currentVersion.imageUrl;
    
    const result = await generateImage({
      prompt,
      imageBase64,
      maskBase64: mask?.imageData,
    });
    
    onSuccess(result.imageUrl, result.imageBase64);
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Generation failed'));
  } finally {
    onEnd();
  }
}

// Create a composite image by merging the original with the generated result
// Only replacing the masked area
export function compositeImages(
  originalCanvas: HTMLCanvasElement,
  generatedImageUrl: string,
  mask: Mask
): Promise<string> {
  return new Promise((resolve, reject) => {
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = originalCanvas.width;
    resultCanvas.height = originalCanvas.height;
    const ctx = resultCanvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    // Draw original
    ctx.drawImage(originalCanvas, 0, 0);
    
    // Load generated image
    const generatedImg = new Image();
    generatedImg.crossOrigin = 'anonymous';
    generatedImg.onload = () => {
      // Load mask
      const maskImg = new Image();
      maskImg.onload = () => {
        // Create mask canvas
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = originalCanvas.width;
        maskCanvas.height = originalCanvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        
        if (!maskCtx) {
          reject(new Error('Could not get mask canvas context'));
          return;
        }
        
        // Draw mask
        maskCtx.drawImage(maskImg, 0, 0, maskCanvas.width, maskCanvas.height);
        
        // Use mask to composite generated image onto original
        ctx.globalCompositeOperation = 'source-over';
        
        // Draw generated image where mask is white
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        const genCtx = document.createElement('canvas');
        genCtx.width = originalCanvas.width;
        genCtx.height = originalCanvas.height;
        const genContext = genCtx.getContext('2d');
        
        if (!genContext) {
          reject(new Error('Could not get generated canvas context'));
          return;
        }
        
        genContext.drawImage(generatedImg, 0, 0, genCtx.width, genCtx.height);
        const genData = genContext.getImageData(0, 0, genCtx.width, genCtx.height);
        const originalData = ctx.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
        
        // Composite based on mask
        for (let i = 0; i < maskData.data.length; i += 4) {
          const maskValue = maskData.data[i]; // R channel
          if (maskValue > 128) {
            // White area - use generated
            originalData.data[i] = genData.data[i];
            originalData.data[i + 1] = genData.data[i + 1];
            originalData.data[i + 2] = genData.data[i + 2];
          }
        }
        
        ctx.putImageData(originalData, 0, 0);
        resolve(resultCanvas.toDataURL('image/png'));
      };
      maskImg.onerror = reject;
      maskImg.src = `data:image/png;base64,${mask.imageData}`;
    };
    generatedImg.onerror = reject;
    generatedImg.src = generatedImageUrl;
  });
}

