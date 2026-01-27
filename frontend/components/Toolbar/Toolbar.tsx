'use client';

import { useRef, useCallback, useState } from 'react';
import { 
  Upload, 
  MousePointer2, 
  Move, 
  PenTool, 
  AlertCircle,
  Sparkles,
  Loader2,
  X,
  Wand2
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { fileToBase64, generateImage } from '@/lib/api';
import type { Tool } from '@/lib/types';
import clsx from 'clsx';

const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 className="w-4 h-4" />, label: 'Select' },
  { id: 'pan', icon: <Move className="w-4 h-4" />, label: 'Pan' },
  { id: 'mask', icon: <PenTool className="w-4 h-4" />, label: 'Mask' },
  { id: 'flaw', icon: <AlertCircle className="w-4 h-4" />, label: 'Mark Flaw' },
];

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  const {
    project,
    activeTool,
    setActiveTool,
    createProject,
    promptText,
    setPromptText,
    isGenerating,
    setIsGenerating,
    currentMask,
    getCurrentVersion,
    addVersion,
    setShowWizard,
  } = useProjectStore();
  
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const base64 = await fileToBase64(file);
      const imageUrl = `data:${file.type};base64,${base64}`;
      createProject(file.name.replace(/\.[^/.]+$/, ''), imageUrl);
    } catch (err) {
      console.error('Error uploading file:', err);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [createProject]);
  
  const handleGenerate = useCallback(async () => {
    const currentVersion = getCurrentVersion();
    if (!currentVersion || !promptText.trim()) return;
    
    setError(null);
    setIsGenerating(true);
    
    try {
      // Extract base64 from current version's data URL
      const imageBase64 = currentVersion.imageUrl.includes(',')
        ? currentVersion.imageUrl.split(',')[1]
        : currentVersion.imageUrl;
      
      const result = await generateImage({
        prompt: promptText,
        imageBase64,
        maskBase64: currentMask?.imageData,
      });
      
      // Add new version
      addVersion(result.imageUrl, promptText, currentMask, currentVersion.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      console.error('Generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [promptText, currentMask, getCurrentVersion, addVersion, setIsGenerating]);
  
  return (
    <div className="flex items-center gap-4 h-14 px-4 bg-white border-b border-sand-200">
      {/* Logo */}
      <div className="flex items-center gap-2 pr-4 border-r border-sand-200">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sand-800">Renderless</span>
      </div>
      
      {/* Guided Workflow Button */}
      <button
        onClick={() => setShowWizard(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-accent-500 text-white hover:bg-accent-600 rounded-lg transition-colors"
      >
        <Wand2 className="w-4 h-4" />
        <span className="hidden sm:inline">New Render</span>
      </button>
      
      {/* Upload Button */}
      <div className="pr-4 border-r border-sand-200">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100 rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload
        </button>
      </div>
      
      {/* Tools */}
      {project && (
        <div className="flex items-center gap-1 pr-4 border-r border-sand-200">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTool === tool.id
                  ? 'bg-accent-100 text-accent-700'
                  : 'text-sand-600 hover:bg-sand-100 hover:text-sand-800'
              )}
              title={tool.label}
            >
              {tool.icon}
              <span className="hidden lg:inline">{tool.label}</span>
            </button>
          ))}
        </div>
      )}
      
      {/* Prompt Input */}
      {project && (
        <div className="flex-1 flex items-center gap-2">
          {/* Mask indicator */}
          {currentMask && (
            <div className="flex items-center gap-1 px-2 py-1 bg-accent-100 text-accent-700 rounded-md text-xs font-medium">
              <PenTool className="w-3 h-3" />
              Mask active
              <button
                onClick={() => useProjectStore.getState().setCurrentMask(null)}
                className="ml-1 hover:text-accent-900"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={currentMask ? "Describe what to generate in the masked area..." : "Describe your changes..."}
            className="flex-1 px-4 py-2 text-sm bg-sand-50 border border-sand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent placeholder:text-sand-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && promptText.trim() && !isGenerating) {
                handleGenerate();
              }
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!promptText.trim() || isGenerating}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              promptText.trim() && !isGenerating
                ? 'bg-accent-500 text-white hover:bg-accent-600 shadow-soft'
                : 'bg-sand-100 text-sand-400 cursor-not-allowed'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      )}
      
      {/* Error Toast */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg shadow-soft flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

