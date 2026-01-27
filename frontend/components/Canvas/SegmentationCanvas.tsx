'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { Loader2 } from 'lucide-react';

interface SegmentationCanvasProps {
  imageUrl: string;
  onMaskGenerated: (maskData: string, bounds: { x: number; y: number; width: number; height: number }) => void;
}

// Simplified SAM-like segmentation using canvas flood fill for MVP
// In production, this would use the actual SAM WASM model
export function SegmentationCanvas({ imageUrl, onMaskGenerated }: SegmentationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  
  const { activeTool } = useProjectStore();
  
  // Load image when URL changes
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      setImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.src = imageUrl;
  }, [imageUrl]);
  
  // Simple region-growing segmentation (placeholder for SAM)
  // This uses color similarity to find connected regions
  const segmentAtPoint = useCallback(async (x: number, y: number) => {
    if (!canvasRef.current || !maskCanvasRef.current || !imageData) return;
    
    setIsProcessing(true);
    
    try {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const maskCtx = maskCanvas.getContext('2d');
      
      if (!maskCtx) return;
      
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      
      // Get the clicked pixel color
      const pixelIndex = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
      const targetR = imageData.data[pixelIndex];
      const targetG = imageData.data[pixelIndex + 1];
      const targetB = imageData.data[pixelIndex + 2];
      
      // Create mask using flood fill with color tolerance
      const tolerance = 32;
      const visited = new Set<number>();
      const maskData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      const stack: [number, number][] = [[Math.floor(x), Math.floor(y)]];
      
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      
      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        const key = py * canvas.width + px;
        
        if (visited.has(key)) continue;
        if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;
        
        const i = key * 4;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        
        // Check color similarity
        const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
        if (diff > tolerance * 3) continue;
        
        visited.add(key);
        
        // Set mask pixel to white (selected)
        maskData[i] = 255;
        maskData[i + 1] = 255;
        maskData[i + 2] = 255;
        maskData[i + 3] = 255;
        
        // Update bounds
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        
        // Add neighbors (4-connected)
        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
      }
      
      // Draw mask
      const newImageData = new ImageData(maskData, canvas.width, canvas.height);
      maskCtx.putImageData(newImageData, 0, 0);
      
      // Convert to base64
      const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];
      
      // Calculate bounds with padding
      const padding = 10;
      const bounds = {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: Math.min(canvas.width - minX + padding, maxX - minX + padding * 2),
        height: Math.min(canvas.height - minY + padding, maxY - minY + padding * 2),
      };
      
      onMaskGenerated(maskBase64, bounds);
    } catch (error) {
      console.error('Segmentation error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [imageData, onMaskGenerated]);
  
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'mask' || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    segmentAtPoint(x, y);
  }, [activeTool, segmentAtPoint]);
  
  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={`block ${activeTool === 'mask' ? 'cursor-crosshair' : 'cursor-default'}`}
      />
      <canvas ref={maskCanvasRef} className="hidden" />
      
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-soft">
            <Loader2 className="w-4 h-4 animate-spin text-accent-500" />
            <span className="text-sm text-sand-600">Segmenting...</span>
          </div>
        </div>
      )}
    </div>
  );
}

