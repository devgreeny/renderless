'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { v4 as uuidv4 } from 'uuid';

interface BrushMaskCanvasProps {
  imageUrl: string;
  isActive: boolean;
}

export function BrushMaskCanvas({ imageUrl, isActive }: BrushMaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  
  const { setCurrentMask } = useProjectStore();
  
  // Load image
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !maskCanvasRef.current) return;
    
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    if (!ctx || !maskCtx) return;
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      maskCanvas.width = img.width;
      maskCanvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      // Clear mask
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      
      setImageDimensions({ width: img.width, height: img.height });
    };
    img.src = imageUrl;
  }, [imageUrl]);
  
  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);
  
  const drawBrush = useCallback((x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
    maskCtx.fill();
  }, [brushSize]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    drawBrush(x, y);
  }, [isActive, getCanvasCoords, drawBrush]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isActive) return;
    const { x, y } = getCanvasCoords(e);
    drawBrush(x, y);
  }, [isDrawing, isActive, getCanvasCoords, drawBrush]);
  
  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    // Convert mask to base64 and update store
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    
    const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];
    
    // Find bounds of the mask
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    let minX = maskCanvas.width, minY = maskCanvas.height, maxX = 0, maxY = 0;
    let hasWhite = false;
    
    for (let y = 0; y < maskCanvas.height; y++) {
      for (let x = 0; x < maskCanvas.width; x++) {
        const i = (y * maskCanvas.width + x) * 4;
        if (imageData.data[i] > 128) {
          hasWhite = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    if (hasWhite) {
      setCurrentMask({
        id: uuidv4(),
        imageData: maskBase64,
        bounds: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
      });
    }
  }, [isDrawing, setCurrentMask]);
  
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    setCurrentMask(null);
  }, [setCurrentMask]);
  
  if (!isActive) return null;
  
  return (
    <div className="absolute inset-0 z-10">
      {/* Mask overlay - shows where user has painted */}
      <canvas
        ref={maskCanvasRef}
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          width: '100%',
          height: '100%',
          mixBlendMode: 'screen',
        }}
      />
      
      {/* Invisible interaction layer */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="absolute inset-0 opacity-0 cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Brush controls */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lifted p-3 space-y-3">
        <div className="text-xs font-medium text-sand-700">Brush Size</div>
        <input
          type="range"
          min="5"
          max="100"
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-32 accent-accent-500"
        />
        <div className="text-xs text-sand-500">{brushSize}px</div>
        <button
          onClick={clearMask}
          className="w-full px-3 py-1.5 text-xs font-medium text-sand-600 bg-sand-100 hover:bg-sand-200 rounded-md transition-colors"
        >
          Clear Mask
        </button>
      </div>
      
      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-lg shadow-soft px-4 py-2">
        <p className="text-sm text-sand-700">
          <span className="font-medium">Paint over the areas</span> you want to regenerate, then enter your prompt
        </p>
      </div>
    </div>
  );
}

