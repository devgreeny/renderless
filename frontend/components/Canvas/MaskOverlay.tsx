'use client';

import { useEffect, useRef } from 'react';
import type { Mask } from '@/lib/types';

interface MaskOverlayProps {
  mask: Mask;
  imageDimensions: { width: number; height: number };
}

export function MaskOverlay({ mask, imageDimensions }: MaskOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !mask.imageData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match image
    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;
    
    // Load and draw mask with semi-transparent overlay
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Fill with semi-transparent overlay
      ctx.fillStyle = 'rgba(229, 107, 62, 0.3)'; // accent color
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Use the mask to cut out the selected area
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(img, 0, 0);
      
      // Reset composite operation
      ctx.globalCompositeOperation = 'source-over';
      
      // Draw border around mask
      ctx.globalCompositeOperation = 'source-atop';
      ctx.strokeStyle = 'rgba(229, 107, 62, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(mask.bounds.x, mask.bounds.y, mask.bounds.width, mask.bounds.height);
    };
    img.src = `data:image/png;base64,${mask.imageData}`;
  }, [mask, imageDimensions]);
  
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  );
}

