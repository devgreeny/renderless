'use client';

import { useProjectStore } from '@/stores/projectStore';
import type { Flaw } from '@/lib/types';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface FlawMarkersProps {
  flaws: Flaw[];
  imageDimensions: { width: number; height: number };
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export function FlawMarkers({ flaws, imageDimensions, canvasRef }: FlawMarkersProps) {
  const { selectedFlawId, selectFlaw, resolveFlaw } = useProjectStore();
  
  if (!canvasRef.current) return null;
  
  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / imageDimensions.width;
  const scaleY = rect.height / imageDimensions.height;
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {flaws.map((flaw, index) => {
        const x = flaw.point.x * scaleX;
        const y = flaw.point.y * scaleY;
        const isSelected = selectedFlawId === flaw.id;
        
        return (
          <div
            key={flaw.id}
            className="absolute pointer-events-auto"
            style={{
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Marker */}
            <button
              onClick={() => selectFlaw(isSelected ? null : flaw.id)}
              className={`
                flex items-center justify-center w-6 h-6 rounded-full
                transition-all duration-200 shadow-soft
                ${flaw.resolved
                  ? 'bg-success-500 text-white'
                  : 'bg-accent-500 text-white hover:bg-accent-600'
                }
                ${isSelected ? 'ring-2 ring-offset-2 ring-accent-500 scale-110' : ''}
              `}
            >
              {flaw.resolved ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <span className="text-xs font-bold">{index + 1}</span>
              )}
            </button>
            
            {/* Tooltip */}
            {isSelected && (
              <div className="absolute left-8 top-0 z-10 animate-fade-in">
                <div className="bg-white rounded-lg shadow-lifted p-3 min-w-[200px] max-w-[280px]">
                  <p className="text-sm text-sand-800">{flaw.description}</p>
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-sand-200">
                    {!flaw.resolved && (
                      <button
                        onClick={() => resolveFlaw(flaw.id)}
                        className="text-xs font-medium text-success-600 hover:text-success-700"
                      >
                        Mark as resolved
                      </button>
                    )}
                    <span className="text-xs text-sand-400">
                      {flaw.createdAt.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

