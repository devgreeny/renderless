'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useProjectStore } from '@/stores/projectStore';
import { MaskOverlay } from './MaskOverlay';
import { FlawMarkers } from './FlawMarkers';
import { v4 as uuidv4 } from 'uuid';
import { Minus, Plus, Eraser } from 'lucide-react';

export function ImageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  
  const {
    getCurrentVersion,
    activeTool,
    currentMask,
    setCurrentMask,
    addFlaw,
    setCanvasScale,
    setCanvasPosition,
  } = useProjectStore();
  
  const currentVersion = getCurrentVersion();
  
  // Load and draw the current image
  useEffect(() => {
    if (!currentVersion?.imageUrl || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setImageLoaded(false);
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      setImageDimensions({ width: img.width, height: img.height });
      setImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setImageLoaded(true);
      
      // Initialize mask canvas
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = img.width;
        maskCanvasRef.current.height = img.height;
        const maskCtx = maskCanvasRef.current.getContext('2d');
        if (maskCtx) {
          maskCtx.fillStyle = 'black';
          maskCtx.fillRect(0, 0, img.width, img.height);
        }
      }
    };
    img.src = currentVersion.imageUrl;
  }, [currentVersion?.imageUrl]);
  
  // Brush drawing for mask tool
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
  
  const updateMaskFromCanvas = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];
    
    // Find bounds of the mask
    const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    let minX = maskCanvas.width, minY = maskCanvas.height, maxX = 0, maxY = 0;
    let hasWhite = false;
    
    for (let y = 0; y < maskCanvas.height; y++) {
      for (let x = 0; x < maskCanvas.width; x++) {
        const i = (y * maskCanvas.width + x) * 4;
        if (maskImageData.data[i] > 128) {
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
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      });
    } else {
      setCurrentMask(null);
    }
  }, [setCurrentMask]);
  
  const clearMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;
    
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    setCurrentMask(null);
  }, [setCurrentMask]);
  
  const handleBrushStart = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'mask') return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    drawBrush(x, y);
  }, [activeTool, getCanvasCoords, drawBrush]);
  
  const handleBrushMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || activeTool !== 'mask') return;
    const { x, y } = getCanvasCoords(e);
    drawBrush(x, y);
  }, [isDrawing, activeTool, getCanvasCoords, drawBrush]);
  
  const handleBrushEnd = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    updateMaskFromCanvas();
  }, [isDrawing, updateMaskFromCanvas]);
  
  // Simple region-growing segmentation for mask tool
  const segmentAtPoint = useCallback((x: number, y: number) => {
    if (!canvasRef.current || !imageData) return;
    
    setIsSegmenting(true);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const canvas = canvasRef.current!;
        const width = canvas.width;
        const height = canvas.height;
        
        // Get the clicked pixel color
        const pixelIndex = (Math.floor(y) * width + Math.floor(x)) * 4;
        const targetR = imageData.data[pixelIndex];
        const targetG = imageData.data[pixelIndex + 1];
        const targetB = imageData.data[pixelIndex + 2];
        
        // Create mask using flood fill with color tolerance
        const tolerance = 40;
        const visited = new Set<number>();
        const maskData = new Uint8ClampedArray(width * height * 4);
        const stack: [number, number][] = [[Math.floor(x), Math.floor(y)]];
        
        let minX = width, minY = height, maxX = 0, maxY = 0;
        
        while (stack.length > 0) {
          const [px, py] = stack.pop()!;
          const key = py * width + px;
          
          if (visited.has(key)) continue;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          
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
        
        // Create mask canvas and convert to base64
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d');
        
        if (maskCtx) {
          const newImageData = new ImageData(maskData, width, height);
          maskCtx.putImageData(newImageData, 0, 0);
          
          const maskBase64 = maskCanvas.toDataURL('image/png').split(',')[1];
          
          // Calculate bounds with padding
          const padding = 10;
          const bounds = {
            x: Math.max(0, minX - padding),
            y: Math.max(0, minY - padding),
            width: Math.min(width - minX + padding, maxX - minX + padding * 2),
            height: Math.min(height - minY + padding, maxY - minY + padding * 2),
          };
          
          setCurrentMask({
            id: uuidv4(),
            imageData: maskBase64,
            bounds,
          });
        }
      } catch (error) {
        console.error('Segmentation error:', error);
      } finally {
        setIsSegmenting(false);
      }
    }, 10);
  }, [imageData, setCurrentMask]);
  
  // Handle canvas clicks based on active tool
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || activeTool === 'pan' || activeTool === 'select' || activeTool === 'mask') return;
      
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      if (activeTool === 'flaw') {
        const description = prompt('Describe the flaw:');
        if (description) {
          addFlaw({ x, y }, description);
        }
      }
    },
    [activeTool, addFlaw]
  );
  
  // Get cursor style based on tool
  const getCursorClass = () => {
    switch (activeTool) {
      case 'pan':
        return 'cursor-grab';
      case 'mask':
        return 'cursor-crosshair';
      case 'flaw':
        return 'cursor-crosshair';
      default:
        return 'cursor-default';
    }
  };
  
  if (!currentVersion) {
    return (
      <div className="flex-1 flex items-center justify-center bg-sand-100">
        <div className="text-center text-sand-500">
          <p className="text-lg font-medium">No image loaded</p>
          <p className="text-sm mt-1">Upload an image to get started</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-sand-100"
      style={{
        backgroundImage: `
          linear-gradient(45deg, #E4DFD7 25%, transparent 25%),
          linear-gradient(-45deg, #E4DFD7 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #E4DFD7 75%),
          linear-gradient(-45deg, transparent 75%, #E4DFD7 75%)
        `,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={5}
        centerOnInit
        wheel={{ step: 0.1 }}
        panning={{ disabled: activeTool !== 'pan' && activeTool !== 'select' }}
        onTransformed={(_, state) => {
          setCanvasScale(state.scale);
          setCanvasPosition({ x: state.positionX, y: state.positionY });
        }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!flex !items-center !justify-center"
            >
              <div className="relative inline-block shadow-lifted rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseDown={handleBrushStart}
                  onMouseMove={handleBrushMove}
                  onMouseUp={handleBrushEnd}
                  onMouseLeave={handleBrushEnd}
                  className={`block max-w-none ${getCursorClass()}`}
                  style={{
                    maxWidth: 'calc(100vw - 400px)',
                    maxHeight: 'calc(100vh - 200px)',
                    width: 'auto',
                    height: 'auto',
                  }}
                />
                
                {/* Mask painting overlay */}
                <canvas
                  ref={maskCanvasRef}
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    width: '100%',
                    height: '100%',
                    opacity: activeTool === 'mask' ? 0.5 : 0,
                    mixBlendMode: 'multiply',
                  }}
                />
                
                {/* Visual mask overlay when not in mask mode */}
                {imageLoaded && currentMask && activeTool !== 'mask' && (
                  <MaskOverlay
                    mask={currentMask}
                    imageDimensions={imageDimensions}
                  />
                )}
                
                {imageLoaded && currentVersion.flaws.length > 0 && (
                  <FlawMarkers
                    flaws={currentVersion.flaws}
                    imageDimensions={imageDimensions}
                    canvasRef={canvasRef}
                  />
                )}
              </div>
            </TransformComponent>
            
            {/* Brush controls when mask tool is active */}
            {activeTool === 'mask' && (
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lifted p-4 space-y-3 z-10">
                <div className="text-sm font-medium text-sand-800">Brush Tool</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBrushSize(Math.max(10, brushSize - 10))}
                    className="p-1.5 rounded-md bg-sand-100 hover:bg-sand-200 transition-colors"
                  >
                    <Minus className="w-4 h-4 text-sand-600" />
                  </button>
                  <div className="w-16 text-center text-sm text-sand-600">{brushSize}px</div>
                  <button
                    onClick={() => setBrushSize(Math.min(100, brushSize + 10))}
                    className="p-1.5 rounded-md bg-sand-100 hover:bg-sand-200 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-sand-600" />
                  </button>
                </div>
                <button
                  onClick={clearMask}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-sand-600 bg-sand-100 hover:bg-sand-200 rounded-lg transition-colors"
                >
                  <Eraser className="w-4 h-4" />
                  Clear Mask
                </button>
                <p className="text-xs text-sand-500">
                  Paint over areas to regenerate
                </p>
              </div>
            )}
            
            {/* Segmentation loading overlay */}
            {isSegmenting && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm pointer-events-none">
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-soft">
                  <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-sand-600">Selecting region...</span>
                </div>
              </div>
            )}
            
            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-soft p-1">
              <button
                onClick={() => zoomOut()}
                className="p-2 hover:bg-sand-100 rounded-md transition-colors"
                title="Zoom out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={() => resetTransform()}
                className="px-2 py-1 text-xs font-medium text-sand-600 hover:bg-sand-100 rounded-md transition-colors"
                title="Reset zoom"
              >
                Fit
              </button>
              <button
                onClick={() => zoomIn()}
                className="p-2 hover:bg-sand-100 rounded-md transition-colors"
                title="Zoom in"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

