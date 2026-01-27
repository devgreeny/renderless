'use client';

import { useState, useCallback } from 'react';
import { 
  Upload, 
  Paintbrush, 
  Sparkles, 
  Check,
  ChevronRight,
  ChevronLeft,
  Zap,
  Building2,
  TreePine,
  Car,
  Trash2,
  PenTool
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { fileToBase64, generateImage } from '@/lib/api';
import clsx from 'clsx';

type WizardStep = 'upload' | 'intent' | 'mask' | 'prompt' | 'generate' | 'review';

interface IntentOption {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  promptTemplate: string;
}

const INTENT_OPTIONS: IntentOption[] = [
  {
    id: 'substation',
    icon: <Zap className="w-6 h-6" />,
    label: 'Electrical Substation',
    description: 'Add power infrastructure, transformers, utility poles',
    promptTemplate: 'Photorealistic electrical substation with transformers, power lines, metal lattice towers, chain-link fencing, and industrial electrical equipment',
  },
  {
    id: 'building',
    icon: <Building2 className="w-6 h-6" />,
    label: 'Building / Structure',
    description: 'Add commercial, industrial, or residential buildings',
    promptTemplate: 'Photorealistic commercial building with modern architecture, matching the existing environment',
  },
  {
    id: 'landscaping',
    icon: <TreePine className="w-6 h-6" />,
    label: 'Landscaping',
    description: 'Add trees, shrubs, grass, or gardens',
    promptTemplate: 'Professional landscaping with mature trees, ornamental shrubs, and manicured lawn',
  },
  {
    id: 'parking',
    icon: <Car className="w-6 h-6" />,
    label: 'Parking / Roads',
    description: 'Add parking lots, driveways, or roads',
    promptTemplate: 'Asphalt parking lot with painted lines, concrete curbs, and proper drainage',
  },
  {
    id: 'remove',
    icon: <Trash2 className="w-6 h-6" />,
    label: 'Remove / Clear',
    description: 'Remove existing structures or objects',
    promptTemplate: 'Empty lot with grass and natural ground, seamlessly blending with surroundings',
  },
  {
    id: 'custom',
    icon: <PenTool className="w-6 h-6" />,
    label: 'Custom',
    description: 'Describe exactly what you want',
    promptTemplate: '',
  },
];

interface WizardFlowProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function WizardFlow({ onComplete, onCancel }: WizardFlowProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [selectedIntent, setSelectedIntent] = useState<IntentOption | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { 
    project, 
    createProject, 
    getCurrentVersion, 
    addVersion, 
    currentMask,
    setCurrentMask 
  } = useProjectStore();
  
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const base64 = await fileToBase64(file);
      const imageUrl = `data:${file.type};base64,${base64}`;
      createProject(file.name.replace(/\.[^/.]+$/, ''), imageUrl);
      setStep('intent');
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload image');
    }
  }, [createProject]);
  
  const handleIntentSelect = useCallback((intent: IntentOption) => {
    setSelectedIntent(intent);
    if (intent.promptTemplate) {
      setCustomPrompt(intent.promptTemplate);
    }
    setStep('mask');
  }, []);
  
  const handleGenerate = useCallback(async () => {
    const currentVersion = getCurrentVersion();
    if (!currentVersion || !customPrompt.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const imageBase64 = currentVersion.imageUrl.includes(',')
        ? currentVersion.imageUrl.split(',')[1]
        : currentVersion.imageUrl;
      
      const result = await generateImage({
        prompt: customPrompt,
        imageBase64,
        maskBase64: currentMask?.imageData,
      });
      
      addVersion(result.imageUrl, customPrompt, currentMask, currentVersion.id);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [customPrompt, currentMask, getCurrentVersion, addVersion]);
  
  const getStepNumber = () => {
    const steps: WizardStep[] = ['upload', 'intent', 'mask', 'prompt', 'generate', 'review'];
    return steps.indexOf(step) + 1;
  };
  
  const canProceed = () => {
    switch (step) {
      case 'upload': return !!project;
      case 'intent': return !!selectedIntent;
      case 'mask': return !!currentMask;
      case 'prompt': return !!customPrompt.trim();
      case 'generate': return !isGenerating;
      case 'review': return true;
      default: return false;
    }
  };
  
  const goNext = () => {
    switch (step) {
      case 'upload': setStep('intent'); break;
      case 'intent': setStep('mask'); break;
      case 'mask': setStep('prompt'); break;
      case 'prompt': setStep('generate'); handleGenerate(); break;
      case 'generate': setStep('review'); break;
      case 'review': onComplete(); break;
    }
  };
  
  const goBack = () => {
    switch (step) {
      case 'intent': setStep('upload'); break;
      case 'mask': setStep('intent'); break;
      case 'prompt': setStep('mask'); break;
      case 'generate': setStep('prompt'); break;
      case 'review': setStep('mask'); setCurrentMask(null); break;
    }
  };
  
  return (
    <div className="fixed inset-0 bg-sand-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lifted max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-sand-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-sand-900">Create Render</h2>
              <p className="text-sm text-sand-500">Step {getStepNumber()} of 5</p>
            </div>
            <button
              onClick={onCancel}
              className="text-sand-400 hover:text-sand-600 transition-colors"
            >
              ✕
            </button>
          </div>
          
          {/* Progress bar */}
          <div className="flex gap-1 mt-4">
            {['upload', 'intent', 'mask', 'prompt', 'review'].map((s, i) => (
              <div
                key={s}
                className={clsx(
                  'h-1 flex-1 rounded-full transition-colors',
                  i < getStepNumber() ? 'bg-accent-500' : 'bg-sand-200'
                )}
              />
            ))}
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <StepUpload onFileSelect={handleFileUpload} />
          )}
          
          {step === 'intent' && (
            <StepIntent 
              options={INTENT_OPTIONS} 
              selected={selectedIntent}
              onSelect={handleIntentSelect}
            />
          )}
          
          {step === 'mask' && (
            <StepMask />
          )}
          
          {step === 'prompt' && (
            <StepPrompt
              value={customPrompt}
              onChange={setCustomPrompt}
              intent={selectedIntent}
            />
          )}
          
          {(step === 'generate' || isGenerating) && (
            <StepGenerate isGenerating={isGenerating} error={error} />
          )}
          
          {step === 'review' && !isGenerating && (
            <StepReview onTryAgain={() => setStep('mask')} />
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-sand-200 flex justify-between">
          <button
            onClick={step === 'upload' ? onCancel : goBack}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sand-600 hover:bg-sand-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 'upload' ? 'Cancel' : 'Back'}
          </button>
          
          {step !== 'generate' && (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                canProceed()
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-sand-100 text-sand-400 cursor-not-allowed'
              )}
            >
              {step === 'prompt' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              ) : step === 'review' ? (
                <>
                  <Check className="w-4 h-4" />
                  Done
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Components

function StepUpload({ onFileSelect }: { onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-2xl bg-accent-100 flex items-center justify-center mx-auto mb-4">
        <Upload className="w-8 h-8 text-accent-600" />
      </div>
      <h3 className="text-xl font-semibold text-sand-900 mb-2">Upload Your Photo</h3>
      <p className="text-sand-600 mb-6 max-w-md mx-auto">
        Start with a photo of the location where you want to visualize changes
      </p>
      
      <label className="inline-block cursor-pointer">
        <input
          type="file"
          accept="image/*"
          onChange={onFileSelect}
          className="hidden"
        />
        <div className="px-6 py-3 bg-accent-500 text-white font-medium rounded-lg hover:bg-accent-600 transition-colors">
          Choose Photo
        </div>
      </label>
      
      <p className="text-xs text-sand-400 mt-4">
        Supports JPG, PNG, WebP • Max 10MB
      </p>
    </div>
  );
}

function StepIntent({ 
  options, 
  selected, 
  onSelect 
}: { 
  options: IntentOption[]; 
  selected: IntentOption | null;
  onSelect: (option: IntentOption) => void;
}) {
  return (
    <div>
      <h3 className="text-xl font-semibold text-sand-900 mb-2">What do you want to add?</h3>
      <p className="text-sand-600 mb-6">Choose the type of change you want to make</p>
      
      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option)}
            className={clsx(
              'p-4 rounded-xl border-2 text-left transition-all',
              selected?.id === option.id
                ? 'border-accent-500 bg-accent-50'
                : 'border-sand-200 hover:border-sand-300 hover:bg-sand-50'
            )}
          >
            <div className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
              selected?.id === option.id ? 'bg-accent-200 text-accent-700' : 'bg-sand-100 text-sand-600'
            )}>
              {option.icon}
            </div>
            <div className="font-medium text-sand-900">{option.label}</div>
            <div className="text-sm text-sand-500 mt-1">{option.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepMask() {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-2xl bg-accent-100 flex items-center justify-center mx-auto mb-4">
        <Paintbrush className="w-8 h-8 text-accent-600" />
      </div>
      <h3 className="text-xl font-semibold text-sand-900 mb-2">Paint the Area</h3>
      <p className="text-sand-600 mb-6 max-w-md mx-auto">
        Use the brush to paint over the area where you want the changes to appear. 
        The painted area will be regenerated.
      </p>
      
      <div className="bg-sand-100 rounded-xl p-4 text-left">
        <h4 className="font-medium text-sand-800 mb-2">Tips:</h4>
        <ul className="text-sm text-sand-600 space-y-1">
          <li>• Paint generously — it's better to cover more area</li>
          <li>• Include some background for seamless blending</li>
          <li>• Use the brush size controls in the canvas</li>
        </ul>
      </div>
      
      <p className="text-sm text-accent-600 mt-4 font-medium">
        ← Go back to the canvas and paint, then click Next
      </p>
    </div>
  );
}

function StepPrompt({ 
  value, 
  onChange, 
  intent 
}: { 
  value: string; 
  onChange: (v: string) => void;
  intent: IntentOption | null;
}) {
  return (
    <div>
      <h3 className="text-xl font-semibold text-sand-900 mb-2">Describe What You Want</h3>
      <p className="text-sand-600 mb-6">
        {intent?.id === 'custom' 
          ? 'Describe in detail what should appear in the painted area'
          : 'We\'ve started a prompt for you — feel free to customize it'}
      </p>
      
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe what should appear in the painted area..."
        className="w-full h-32 px-4 py-3 text-sm bg-sand-50 border border-sand-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
      />
      
      <div className="mt-4 p-3 bg-sand-50 rounded-lg">
        <p className="text-xs text-sand-500">
          <strong>Pro tip:</strong> Be specific about materials, colors, and style. 
          For example: "steel lattice power poles" instead of just "power poles"
        </p>
      </div>
    </div>
  );
}

function StepGenerate({ isGenerating, error }: { isGenerating: boolean; error: string | null }) {
  return (
    <div className="text-center py-12">
      {isGenerating ? (
        <>
          <div className="w-16 h-16 rounded-full border-4 border-accent-200 border-t-accent-500 animate-spin mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-sand-900 mb-2">Generating Your Render</h3>
          <p className="text-sand-600">This usually takes 10-20 seconds...</p>
        </>
      ) : error ? (
        <>
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="text-xl font-semibold text-sand-900 mb-2">Generation Failed</h3>
          <p className="text-red-600">{error}</p>
        </>
      ) : null}
    </div>
  );
}

function StepReview({ onTryAgain }: { onTryAgain: () => void }) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-xl font-semibold text-sand-900 mb-2">Render Complete!</h3>
      <p className="text-sand-600 mb-6">
        Check the result in the canvas. You can make more edits or finish.
      </p>
      
      <button
        onClick={onTryAgain}
        className="text-accent-600 hover:text-accent-700 font-medium"
      >
        Not quite right? Try again with different settings
      </button>
    </div>
  );
}

