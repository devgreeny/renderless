'use client';

import { useState, useCallback } from 'react';
import { 
  Sparkles, 
  Loader2, 
  ChevronDown,
  ChevronUp,
  Zap,
  Building2,
  TreePine,
  Sun,
  Cloud,
  Sunset
} from 'lucide-react';
import clsx from 'clsx';

// Scene types - what IS the photo of
const SCENE_TYPES = {
  substation: {
    label: 'Electrical Infrastructure',
    icon: Zap,
    description: 'Power substations, transmission lines, utility equipment',
  },
  commercial: {
    label: 'Commercial Property',
    icon: Building2,
    description: 'Office buildings, retail, warehouses',
  },
  industrial: {
    label: 'Industrial Site',
    icon: Building2,
    description: 'Factories, plants, heavy equipment',
  },
  landscape: {
    label: 'Open Land / Landscape',
    icon: TreePine,
    description: 'Empty lots, fields, natural areas',
  },
};

// Location grid for placement
const LOCATION_GRID = [
  { id: 'bg-left', label: 'Background Left', position: 'in the far background on the left side' },
  { id: 'bg-center', label: 'Background Center', position: 'in the far background in the center' },
  { id: 'bg-right', label: 'Background Right', position: 'in the far background on the right side' },
  { id: 'mid-left', label: 'Middle Left', position: 'in the middle ground on the left' },
  { id: 'mid-center', label: 'Middle Center', position: 'in the middle ground at center' },
  { id: 'mid-right', label: 'Middle Right', position: 'in the middle ground on the right' },
  { id: 'fg-left', label: 'Foreground Left', position: 'in the foreground on the left' },
  { id: 'fg-center', label: 'Foreground Center', position: 'in the foreground at center' },
  { id: 'fg-right', label: 'Foreground Right', position: 'in the foreground on the right' },
];

// Elements that can be added with their visual descriptions
const ADDABLE_ELEMENTS = {
  // Electrical
  transmission_tower: { 
    label: 'Transmission Tower', 
    visual: 'tall steel lattice transmission tower with high voltage power lines',
    category: 'electrical'
  },
  transformer: { 
    label: 'Transformer', 
    visual: 'large grey industrial electrical transformer unit',
    category: 'electrical'
  },
  utility_pole: { 
    label: 'Utility Pole', 
    visual: 'wooden utility pole with distribution power lines and insulators',
    category: 'electrical'
  },
  substation_equipment: { 
    label: 'Substation Equipment', 
    visual: 'electrical substation equipment including circuit breakers and switches',
    category: 'electrical'
  },
  
  // Buildings
  control_building: { 
    label: 'Control Building', 
    visual: 'small industrial control building with metal siding',
    category: 'buildings'
  },
  warehouse: { 
    label: 'Warehouse', 
    visual: 'large metal warehouse building',
    category: 'buildings'
  },
  office_building: { 
    label: 'Office Building', 
    visual: 'modern office building with glass windows',
    category: 'buildings'
  },
  
  // Infrastructure
  security_fence: { 
    label: 'Security Fence', 
    visual: 'chain-link security fence with barbed wire top',
    category: 'infrastructure'
  },
  access_road: { 
    label: 'Access Road', 
    visual: 'paved access road',
    category: 'infrastructure'
  },
  parking_area: { 
    label: 'Parking Area', 
    visual: 'paved parking area with marked spaces',
    category: 'infrastructure'
  },
  
  // Landscape
  trees: { 
    label: 'Trees', 
    visual: 'mature deciduous trees',
    category: 'landscape'
  },
  shrubs: { 
    label: 'Shrubs/Hedges', 
    visual: 'landscaping shrubs and hedges',
    category: 'landscape'
  },
  grass_area: { 
    label: 'Grass Area', 
    visual: 'maintained grass lawn area',
    category: 'landscape'
  },
};

// Lighting conditions
const LIGHTING_OPTIONS = [
  { id: 'midday', label: 'Midday', icon: Sun, prompt: 'bright midday sunlight, clear sky, sharp shadows' },
  { id: 'overcast', label: 'Overcast', icon: Cloud, prompt: 'overcast sky, soft diffused lighting, no harsh shadows' },
  { id: 'golden', label: 'Golden Hour', icon: Sunset, prompt: 'golden hour warm lighting, long shadows, orange tinted sky' },
  { id: 'morning', label: 'Morning', icon: Sun, prompt: 'early morning light, soft warm tones, slight mist' },
];

// Render quality/style
const RENDER_STYLES = [
  { id: 'architectural', label: 'Architectural Render', prompt: 'professional architectural visualization, 3D render quality, clean and polished' },
  { id: 'photorealistic', label: 'Photorealistic', prompt: 'photorealistic rendering, indistinguishable from photograph' },
  { id: 'conceptual', label: 'Concept Art', prompt: 'architectural concept art style, slightly stylized' },
];

interface PlacedElement {
  elementId: string;
  locationId: string;
}

interface PromptBuilderProps {
  sceneDescription?: string;
  onPromptGenerated: (prompt: string) => void;
  isLoading?: boolean;
}

export function PromptBuilder({ sceneDescription, onPromptGenerated, isLoading }: PromptBuilderProps) {
  const [sceneType, setSceneType] = useState<string | null>(null);
  const [placedElements, setPlacedElements] = useState<PlacedElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [lighting, setLighting] = useState('midday');
  const [renderStyle, setRenderStyle] = useState('architectural');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customContext, setCustomContext] = useState('');
  
  const addElementToLocation = (locationId: string) => {
    if (!selectedElement) return;
    
    // Check if location already has this element
    const exists = placedElements.some(
      p => p.elementId === selectedElement && p.locationId === locationId
    );
    
    if (!exists) {
      setPlacedElements([...placedElements, { elementId: selectedElement, locationId }]);
    }
    setSelectedElement(null);
  };
  
  const removeElement = (index: number) => {
    setPlacedElements(placedElements.filter((_, i) => i !== index));
  };
  
  const buildPrompt = useCallback(() => {
    const parts: string[] = [];
    
    // 1. Base render style
    const style = RENDER_STYLES.find(s => s.id === renderStyle);
    if (style) parts.push(style.prompt);
    
    // 2. Scene type context
    if (sceneType) {
      const scene = SCENE_TYPES[sceneType as keyof typeof SCENE_TYPES];
      parts.push(`showing ${scene.description}`);
    }
    
    // 3. Existing scene context from GPT-4o analysis
    if (sceneDescription) {
      parts.push(`The existing scene contains: ${sceneDescription.slice(0, 200)}`);
    }
    
    // 4. Placed elements with SPECIFIC locations
    if (placedElements.length > 0) {
      const elementDescriptions = placedElements.map(placed => {
        const element = ADDABLE_ELEMENTS[placed.elementId as keyof typeof ADDABLE_ELEMENTS];
        const location = LOCATION_GRID.find(l => l.id === placed.locationId);
        return `${element.visual} ${location?.position}`;
      });
      parts.push(`Include: ${elementDescriptions.join('; ')}`);
    }
    
    // 5. Custom context
    if (customContext.trim()) {
      parts.push(customContext.trim());
    }
    
    // 6. Lighting
    const light = LIGHTING_OPTIONS.find(l => l.id === lighting);
    if (light) parts.push(light.prompt);
    
    // 7. Technical quality
    parts.push('high resolution, detailed textures, realistic materials, proper scale and proportions');
    
    return parts.join('. ');
  }, [sceneType, sceneDescription, placedElements, lighting, renderStyle, customContext]);
  
  const generatedPrompt = buildPrompt();
  const canGenerate = sceneType !== null;
  
  return (
    <div className="space-y-6">
      {/* Step 1: Scene Type */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-accent-500 text-white text-xs flex items-center justify-center font-bold">1</span>
          <label className="text-sm font-medium text-sand-700">
            What type of site is this?
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SCENE_TYPES).map(([key, scene]) => {
            const Icon = scene.icon;
            return (
              <button
                key={key}
                onClick={() => setSceneType(key)}
                className={clsx(
                  'flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left',
                  sceneType === key
                    ? 'border-accent-500 bg-accent-50'
                    : 'border-sand-200 hover:border-sand-300'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={clsx('w-4 h-4', sceneType === key ? 'text-accent-600' : 'text-sand-500')} />
                  <span className={clsx('text-sm font-medium', sceneType === key ? 'text-accent-700' : 'text-sand-700')}>
                    {scene.label}
                  </span>
                </div>
                <span className="text-xs text-sand-500">{scene.description}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Step 2: Add Elements */}
      {sceneType && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-accent-500 text-white text-xs flex items-center justify-center font-bold">2</span>
            <label className="text-sm font-medium text-sand-700">
              Add elements to specific locations
            </label>
          </div>
          
          {/* Element picker */}
          <div className="mb-4">
            <p className="text-xs text-sand-500 mb-2">Select an element, then click where to place it:</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ADDABLE_ELEMENTS).map(([key, element]) => (
                <button
                  key={key}
                  onClick={() => setSelectedElement(selectedElement === key ? null : key)}
                  className={clsx(
                    'px-2 py-1 rounded text-xs font-medium transition-all',
                    selectedElement === key
                      ? 'bg-accent-500 text-white ring-2 ring-accent-300'
                      : 'bg-sand-100 text-sand-700 hover:bg-sand-200'
                  )}
                >
                  {element.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Location Grid */}
          <div className="bg-sand-100 rounded-lg p-3 mb-4">
            <div className="grid grid-cols-3 gap-1.5 aspect-[4/3]">
              {LOCATION_GRID.map(location => {
                const elementsHere = placedElements.filter(p => p.locationId === location.id);
                return (
                  <button
                    key={location.id}
                    onClick={() => addElementToLocation(location.id)}
                    disabled={!selectedElement}
                    className={clsx(
                      'rounded border-2 border-dashed flex flex-col items-center justify-center p-1 text-center transition-all',
                      selectedElement
                        ? 'border-accent-400 bg-accent-50 hover:bg-accent-100 cursor-pointer'
                        : 'border-sand-300 bg-white',
                      elementsHere.length > 0 && 'border-solid border-green-400 bg-green-50'
                    )}
                  >
                    <span className="text-[10px] text-sand-500 font-medium">{location.label}</span>
                    {elementsHere.length > 0 && (
                      <span className="text-[9px] text-green-600 mt-0.5">
                        {elementsHere.length} item{elementsHere.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedElement && (
              <p className="text-xs text-accent-600 mt-2 text-center">
                Click a location to place: <strong>{ADDABLE_ELEMENTS[selectedElement as keyof typeof ADDABLE_ELEMENTS].label}</strong>
              </p>
            )}
          </div>
          
          {/* Placed elements list */}
          {placedElements.length > 0 && (
            <div className="space-y-1 mb-4">
              <p className="text-xs font-medium text-sand-600">Placed elements:</p>
              {placedElements.map((placed, index) => {
                const element = ADDABLE_ELEMENTS[placed.elementId as keyof typeof ADDABLE_ELEMENTS];
                const location = LOCATION_GRID.find(l => l.id === placed.locationId);
                return (
                  <div key={index} className="flex items-center justify-between bg-white rounded px-2 py-1 text-xs">
                    <span className="text-sand-700">
                      <strong>{element.label}</strong> → {location?.label}
                    </span>
                    <button
                      onClick={() => removeElement(index)}
                      className="text-red-500 hover:text-red-700 font-medium"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Step 3: Lighting & Style */}
      {sceneType && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-accent-500 text-white text-xs flex items-center justify-center font-bold">3</span>
            <label className="text-sm font-medium text-sand-700">
              Lighting & Style
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Lighting */}
            <div>
              <p className="text-xs text-sand-500 mb-2">Lighting</p>
              <div className="space-y-1">
                {LIGHTING_OPTIONS.map(option => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setLighting(option.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all',
                        lighting === option.id
                          ? 'bg-sand-800 text-white'
                          : 'bg-sand-100 text-sand-700 hover:bg-sand-200'
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Render Style */}
            <div>
              <p className="text-xs text-sand-500 mb-2">Render Style</p>
              <div className="space-y-1">
                {RENDER_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setRenderStyle(style.id)}
                    className={clsx(
                      'w-full px-2 py-1.5 rounded text-xs text-left transition-all',
                      renderStyle === style.id
                        ? 'bg-sand-800 text-white'
                        : 'bg-sand-100 text-sand-700 hover:bg-sand-200'
                    )}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Advanced Options */}
      {sceneType && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs text-sand-500 hover:text-sand-700"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Additional Context
          </button>
          
          {showAdvanced && (
            <textarea
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="Add any additional details about the scene, existing structures to preserve, or specific requirements..."
              className="w-full mt-2 px-3 py-2 text-xs bg-sand-50 border border-sand-200 rounded-lg resize-none h-16 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          )}
        </div>
      )}
      
      {/* Preview */}
      {sceneType && (
        <div className="p-3 bg-sand-50 rounded-lg border border-sand-200">
          <p className="text-xs font-medium text-sand-600 mb-1">Generated Prompt:</p>
          <p className="text-xs text-sand-700 leading-relaxed">{generatedPrompt}</p>
        </div>
      )}
      
      {/* Generate Button */}
      <button
        onClick={() => onPromptGenerated(generatedPrompt)}
        disabled={!canGenerate || isLoading}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all',
          canGenerate && !isLoading
            ? 'bg-accent-500 text-white hover:bg-accent-600 shadow-soft'
            : 'bg-sand-200 text-sand-400 cursor-not-allowed'
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating Render...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Render
          </>
        )}
      </button>
    </div>
  );
}
