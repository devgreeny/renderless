'use client';

import { useState, useCallback } from 'react';
import { 
  Upload, 
  Sparkles, 
  Check,
  ChevronLeft,
  Loader2,
  Image as ImageIcon,
  Wand2,
  RefreshCw,
  Palette,
  Plus
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { fileToBase64, generateWithReplicate, styleTransfer } from '@/lib/api';
import { PromptBuilder } from './PromptBuilder';
import clsx from 'clsx';

type WizardStep = 'upload' | 'analyze' | 'stylize' | 'stylize-progress' | 'add-elements' | 'generate' | 'review';

interface RenderWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function RenderWizard({ onComplete, onCancel }: RenderWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [stylizedImage, setStylizedImage] = useState<string | null>(null);
  const [sceneDescription, setSceneDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  const { createProject, addVersion, getCurrentVersion } = useProjectStore();
  
  // Analyze the uploaded image using GPT-4o
  const analyzeImage = useCallback(async (imageBase64: string) => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          prompt: `Describe this scene for an architectural render. Include:
1. Camera position and angle
2. Main structures/buildings (describe each)
3. Infrastructure (roads, parking, fences)
4. Vegetation and landscaping
5. Lighting conditions

Keep it under 150 words but be specific about visual details.`
        }),
      });
      
      if (!response.ok) throw new Error('Analysis failed');
      
      const data = await response.json();
      setSceneDescription(data.analysis || '');
      setStep('stylize');
    } catch (err) {
      console.error('Analysis error:', err);
      setSceneDescription('');
      setStep('stylize');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);
  
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const base64 = await fileToBase64(file);
      const imageUrl = `data:${file.type};base64,${base64}`;
      setUploadedImage(imageUrl);
      createProject(file.name.replace(/\.[^/.]+$/, ''), imageUrl);
      setStep('analyze');
      analyzeImage(base64);
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload image');
    }
  }, [createProject, analyzeImage]);
  
  // Step 1: Style transfer - use ControlNet for 1:1 structure preservation
  const handleStyleTransfer = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setStep('stylize-progress');
    
    try {
      const currentVersion = getCurrentVersion();
      if (!currentVersion) throw new Error('No image loaded');
      
      const imageBase64 = currentVersion.imageUrl.includes(',')
        ? currentVersion.imageUrl.split(',')[1]
        : currentVersion.imageUrl;
      
      // Simple, clear prompt for style transfer
      const stylePrompt = `Professional architectural 3D render, photorealistic visualization, clean modern rendering style, high quality textures and materials, professional lighting, architectural photography`;
      
      // Use ControlNet - this preserves EXACT edges and structure
      const result = await styleTransfer({
        prompt: stylePrompt,
        imageBase64,
      });
      
      setStylizedImage(result.imageUrl);
      addVersion(result.imageUrl, 'Style transfer to architectural render', null, currentVersion.id);
      setStep('add-elements');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Style transfer failed');
      setStep('stylize');
    } finally {
      setIsGenerating(false);
    }
  }, [getCurrentVersion, addVersion]);
  
  // Step 2: Add elements to the stylized image
  const handleAddElements = useCallback(async (prompt: string) => {
    setGeneratedPrompt(prompt);
    setIsGenerating(true);
    setError(null);
    setStep('generate');
    
    try {
      const currentVersion = getCurrentVersion();
      if (!currentVersion) throw new Error('No image loaded');
      
      const imageBase64 = currentVersion.imageUrl.includes(',')
        ? currentVersion.imageUrl.split(',')[1]
        : currentVersion.imageUrl;
      
      // Medium strength - we want to ADD elements while keeping the render
      const result = await generateWithReplicate({
        prompt,
        imageBase64,
        strength: 0.5, // Medium - enough to add elements but keep the base
        style: 'architectural',
      });
      
      setGeneratedImage(result.imageUrl);
      addVersion(result.imageUrl, prompt, null, currentVersion.id);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep('add-elements');
    } finally {
      setIsGenerating(false);
    }
  }, [getCurrentVersion, addVersion]);
  
  const handleSkipElements = () => {
    setGeneratedImage(stylizedImage);
    setStep('review');
  };
  
  const handleTryAgain = () => {
    setStep('add-elements');
    setError(null);
  };
  
  const handleBackToStylize = () => {
    setStep('stylize');
    setStylizedImage(null);
  };
  
  const getStepNumber = () => {
    const stepMap: Record<WizardStep, number> = {
      'upload': 1,
      'analyze': 2,
      'stylize': 3,
      'stylize-progress': 3,
      'add-elements': 4,
      'generate': 5,
      'review': 6
    };
    return stepMap[step];
  };
  
  const totalSteps = 6;
  
  return (
    <div className="fixed inset-0 bg-sand-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lifted max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-sand-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-sand-900">Create Render</h2>
                <p className="text-sm text-sand-500">
                  {step === 'upload' && 'Step 1: Upload your reference photo'}
                  {step === 'analyze' && 'Analyzing your scene...'}
                  {step === 'stylize' && 'Step 2: Convert to render style'}
                  {step === 'stylize-progress' && 'Converting to render...'}
                  {step === 'add-elements' && 'Step 3: Add elements (optional)'}
                  {step === 'generate' && 'Generating...'}
                  {step === 'review' && 'Review your render'}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-sand-400 hover:text-sand-600 transition-colors text-xl"
            >
              ✕
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="flex gap-1 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={clsx(
                  'h-1 flex-1 rounded-full transition-colors',
                  i < getStepNumber() ? 'bg-accent-500' : 'bg-sand-200'
                )}
              />
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 rounded-2xl bg-accent-100 flex items-center justify-center mx-auto mb-6">
                  <Upload className="w-10 h-10 text-accent-600" />
                </div>
                <h3 className="text-2xl font-semibold text-sand-900 mb-3">
                  Upload Your Photo
                </h3>
                <p className="text-sand-600 mb-8">
                  Start with a photo of the location. We'll first convert it to a render style, then you can add elements.
                </p>
                
                <label className="block cursor-pointer group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-sand-300 rounded-2xl p-8 transition-all group-hover:border-accent-400 group-hover:bg-accent-50/50">
                    <ImageIcon className="w-8 h-8 text-sand-400 mx-auto mb-3" />
                    <p className="text-sand-700 font-medium">Click to choose a photo</p>
                    <p className="text-sm text-sand-500 mt-1">or drag and drop</p>
                  </div>
                </label>
              </div>
            </div>
          )}
          
          {/* Analyze Step */}
          {step === 'analyze' && (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 rounded-full border-4 border-accent-200 border-t-accent-500 animate-spin mx-auto mb-6" />
                <h3 className="text-2xl font-semibold text-sand-900 mb-3">
                  Analyzing Your Scene
                </h3>
                <p className="text-sand-600">
                  Understanding the composition and elements...
                </p>
                
                {uploadedImage && (
                  <div className="mt-8 rounded-xl overflow-hidden shadow-soft max-w-sm mx-auto">
                    <img src={uploadedImage} alt="Uploaded" className="w-full" />
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Stylize Step - Choose to convert */}
          {step === 'stylize' && (
            <div className="p-8">
              <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
                    <Palette className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="text-2xl font-semibold text-sand-900 mb-2">
                    Convert to Architectural Render
                  </h3>
                  <p className="text-sand-600">
                    First, we'll transform your photo into a clean architectural render style while keeping the exact same scene.
                  </p>
                </div>
                
                <div className="flex gap-6 items-start">
                  {/* Original */}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-sand-500 mb-2 text-center">Your Photo</p>
                    <div className="rounded-xl overflow-hidden shadow-soft">
                      <img src={uploadedImage!} alt="Original" className="w-full" />
                    </div>
                  </div>
                  
                  {/* Arrow */}
                  <div className="flex items-center justify-center pt-12">
                    <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center">
                      <ChevronLeft className="w-6 h-6 text-accent-600 rotate-180" />
                    </div>
                  </div>
                  
                  {/* Preview of what it will become */}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-sand-500 mb-2 text-center">Architectural Render</p>
                    <div className="rounded-xl overflow-hidden shadow-soft bg-gradient-to-br from-sand-100 to-sand-200 aspect-[4/3] flex items-center justify-center">
                      <div className="text-center p-4">
                        <Sparkles className="w-8 h-8 text-accent-500 mx-auto mb-2" />
                        <p className="text-sm text-sand-600">Same scene, render style</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {sceneDescription && (
                  <div className="mt-6 p-4 bg-sand-50 rounded-lg">
                    <p className="text-xs font-medium text-sand-500 mb-1">Scene Analysis</p>
                    <p className="text-sm text-sand-700">{sceneDescription}</p>
                  </div>
                )}
                
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}
                
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={handleStyleTransfer}
                    className="flex items-center gap-2 px-8 py-3 bg-accent-500 text-white font-medium rounded-xl hover:bg-accent-600 transition-colors shadow-soft"
                  >
                    <Palette className="w-5 h-5" />
                    Convert to Render Style
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Stylize Progress */}
          {step === 'stylize-progress' && (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 rounded-full border-4 border-purple-200 border-t-purple-500 animate-spin mx-auto mb-6" />
                <h3 className="text-2xl font-semibold text-sand-900 mb-3">
                  Converting to Render Style
                </h3>
                <p className="text-sand-600 mb-6">
                  Transforming your photo while preserving the exact composition...
                </p>
                <p className="text-sm text-sand-500">This takes about 15-30 seconds</p>
              </div>
            </div>
          )}
          
          {/* Add Elements Step */}
          {step === 'add-elements' && (
            <div className="p-6">
              <div className="flex gap-6">
                {/* Stylized Preview */}
                <div className="w-1/2">
                  <h4 className="text-sm font-medium text-sand-500 mb-3 flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    Stylized Render
                  </h4>
                  <div className="rounded-xl overflow-hidden shadow-soft sticky top-4">
                    <img src={stylizedImage!} alt="Stylized" className="w-full" />
                  </div>
                  
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      ✓ Photo converted to render style. Now you can add elements or finish here.
                    </p>
                  </div>
                </div>
                
                {/* Element Builder */}
                <div className="w-1/2">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-sand-500 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add Elements (Optional)
                    </h4>
                    <button
                      onClick={handleSkipElements}
                      className="text-xs text-sand-500 hover:text-sand-700 underline"
                    >
                      Skip, use render as-is
                    </button>
                  </div>
                  
                  <PromptBuilder
                    sceneDescription={sceneDescription}
                    onPromptGenerated={handleAddElements}
                    isLoading={isGenerating}
                  />
                  
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Generate Progress */}
          {step === 'generate' && (
            <div className="p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 rounded-full border-4 border-accent-200 border-t-accent-500 animate-spin mx-auto mb-6" />
                <h3 className="text-2xl font-semibold text-sand-900 mb-3">
                  Adding Elements
                </h3>
                <p className="text-sand-600 mb-6">
                  Generating your final render with new elements...
                </p>
                
                <div className="p-4 bg-sand-50 rounded-lg text-left">
                  <p className="text-xs font-medium text-sand-500 mb-2">Prompt</p>
                  <p className="text-sm text-sand-700">{generatedPrompt}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Review Step */}
          {step === 'review' && (
            <div className="p-6">
              <div className="grid grid-cols-3 gap-4">
                {/* Original */}
                <div>
                  <h4 className="text-sm font-medium text-sand-500 mb-2 text-center">Original Photo</h4>
                  <div className="rounded-xl overflow-hidden shadow-soft">
                    <img src={uploadedImage!} alt="Original" className="w-full" />
                  </div>
                </div>
                
                {/* Stylized */}
                <div>
                  <h4 className="text-sm font-medium text-sand-500 mb-2 text-center">
                    After Style Transfer
                  </h4>
                  <div className="rounded-xl overflow-hidden shadow-soft">
                    <img src={stylizedImage!} alt="Stylized" className="w-full" />
                  </div>
                </div>
                
                {/* Final */}
                <div>
                  <h4 className="text-sm font-medium text-sand-500 mb-2 text-center flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent-500" />
                    Final Render
                  </h4>
                  <div className="rounded-xl overflow-hidden shadow-soft ring-2 ring-accent-500">
                    <img src={generatedImage!} alt="Final" className="w-full" />
                  </div>
                </div>
              </div>
              
              {generatedPrompt && (
                <div className="mt-4 p-4 bg-sand-50 rounded-lg">
                  <p className="text-xs font-medium text-sand-500 mb-2">Elements Added</p>
                  <p className="text-sm text-sand-700 max-h-20 overflow-y-auto">{generatedPrompt}</p>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-sand-200 flex justify-between">
          <button
            onClick={() => {
              if (step === 'upload') onCancel();
              else if (step === 'stylize') onCancel();
              else if (step === 'add-elements') handleBackToStylize();
              else if (step === 'review') handleTryAgain();
            }}
            disabled={step === 'analyze' || step === 'stylize-progress' || step === 'generate'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sand-600 hover:bg-sand-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {step === 'review' ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Try Different Elements
              </>
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                {step === 'upload' || step === 'stylize' ? 'Cancel' : 'Back'}
              </>
            )}
          </button>
          
          {step === 'review' && (
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-6 py-2 bg-accent-500 text-white font-medium rounded-lg hover:bg-accent-600 transition-colors"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
