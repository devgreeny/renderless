'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import { Upload, Loader2, Download, History, X, ImagePlus, Images, FileImage, Sparkles, ArrowLeft, Coins } from 'lucide-react';
import { ChatInterface, GatheredInfo } from '@/components/Chat';
import { 
  supabase,
  isSupabaseConfigured,
  getOrCreateUser, 
  getProjectRenders, 
  saveRender, 
  uploadImage,
  type User, 
  type Project, 
  type Render 
} from '@/lib/supabase';

interface Version {
  id: number;
  imageUrl: string;
  prompt: string;
  timestamp: Date;
  dbId?: string; // Supabase render ID
}

interface ReferenceImage {
  id: string;
  url: string;
  base64: string;
  name: string;
}

export default function ProjectEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { user, isLoaded } = useUser();
  
  // Database state
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Chat Assistant state
  const [imageAnalysis, setImageAnalysis] = useState<string>('');
  const [renderReady, setRenderReady] = useState(false);

  // Reference images for multi-image prompts (up to 5)
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  
  // Render mode: 'plan_to_render' keeps it accurate, 'pretty_render' adds marketing polish
  const [renderMode, setRenderMode] = useState<'plan_to_render' | 'pretty_render'>('plan_to_render');

  const currentImage = currentVersionIndex >= 0 
    ? versions[currentVersionIndex]?.imageUrl 
    : originalImage;

  // Load project and user data
  useEffect(() => {
    async function loadProject() {
      if (!isLoaded || !user) return;

      const email = user.primaryEmailAddress?.emailAddress || '';
      const userData = await getOrCreateUser(user.id, email);
      setDbUser(userData);

      // Load project
      if (!supabase) {
        router.push('/projects');
        return;
      }
      
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError || !projectData) {
        router.push('/projects');
        return;
      }

      setProject(projectData);

      // Load original image if exists
      if (projectData.original_image_url) {
        setOriginalImage(projectData.original_image_url);
        setRenderReady(true);
        
        // Analyze the image
        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              image_base64: projectData.original_image_url.split(',')[1] || '',
              prompt: `Analyze this image carefully. Look for:
1. RED PEN ANNOTATIONS: Are there any red markings, circles, arrows, lines, X marks, or handwritten notes?
2. SCENE DESCRIPTION: Briefly describe the main scene.
Keep response under 100 words.`,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            setImageAnalysis(data.analysis || '');
          }
        } catch (err) {
          console.error('Image analysis failed:', err);
        }
      }

      // Load existing renders
      const renders = await getProjectRenders(projectId);
      if (renders.length > 0) {
        const loadedVersions: Version[] = renders.map((r, idx) => ({
          id: idx + 1,
          imageUrl: r.image_url,
          prompt: r.prompt,
          timestamp: new Date(r.created_at),
          dbId: r.id,
        }));
        setVersions(loadedVersions);
        setCurrentVersionIndex(loadedVersions.length - 1);
      }

      setIsLoadingProject(false);
    }

    loadProject();
  }, [isLoaded, user, projectId, router]);

  // Analyze image when uploaded
  const analyzeImageForChat = useCallback(async (imageBase64: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image_base64: imageBase64,
          prompt: `Analyze this image carefully. Look for:
1. RED PEN ANNOTATIONS: Are there any red markings, circles, arrows, lines?
2. SCENE DESCRIPTION: Briefly describe the main scene.
Keep response under 100 words.`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setImageAnalysis(data.analysis || '');
      }
    } catch (err) {
      console.error('Image analysis failed:', err);
    }
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const imageUrl = event.target?.result as string;
      setOriginalImage(imageUrl);
      setVersions([]);
      setCurrentVersionIndex(-1);
      setError(null);
      setRenderReady(true);
      setReferenceImages([]);
      
      const base64 = imageUrl.split(',')[1];
      analyzeImageForChat(base64);

      // Save original image to project
      if (project && supabase) {
        await supabase
          .from('projects')
          .update({ original_image_url: imageUrl })
          .eq('id', project.id);
      }
    };
    reader.readAsDataURL(file);
  }, [analyzeImageForChat, project]);

  // Handle reference image upload
  const handleReferenceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = 5 - referenceImages.length;
    const filesToProcess = Array.from(files).slice(0, remaining);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        const base64 = imageUrl.split(',')[1];
        
        const newRef: ReferenceImage = {
          id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: imageUrl,
          base64: base64,
          name: file.name,
        };
        
        setReferenceImages(prev => [...prev, newRef].slice(0, 5));
      };
      reader.readAsDataURL(file);
    });
    
    if (e.target) e.target.value = '';
  }, [referenceImages.length]);

  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // Handle chat-based render generation
  const handleChatGenerate = useCallback(async (prompt: string, gatheredInfo: GatheredInfo): Promise<string | null> => {
    const sourceImage = currentImage || originalImage;
    if (!sourceImage || !dbUser) return null;

    // Check credits
    if (dbUser.credits <= 0) {
      setError('Out of credits! Contact Noah for more.');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const base64 = sourceImage.split(',')[1];

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageBase64: base64,
          prompt: prompt,
          referenceImages: referenceImages.map(ref => ref.base64),
          renderMode: renderMode,  // 'plan_to_render' or 'pretty_render'
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Edit failed');
      }

      const data = await response.json();
      
      // Save render to database
      if (project) {
        setIsSaving(true);
        await saveRender(
          project.id,
          data.imageUrl,
          prompt,
          renderMode === 'pretty_render' ? 'reimagine' : 'edit',
          null,
          { referenceImages: referenceImages.length }
        );
        
        // Deduct credit
        if (supabase) {
          await supabase
            .from('users')
            .update({ 
              credits: dbUser.credits - 1,
              total_renders: dbUser.total_renders + 1,
            })
            .eq('id', dbUser.id);
        }
        
        setDbUser({ ...dbUser, credits: dbUser.credits - 1 });
        setIsSaving(false);
      }

      const newVersion: Version = {
        id: versions.length + 1,
        imageUrl: data.imageUrl,
        prompt: prompt,
        timestamp: new Date(),
      };
      
      const newVersions = versions.length === 0 
        ? [newVersion]
        : [...versions.slice(0, currentVersionIndex + 1), newVersion];
      setVersions(newVersions);
      setCurrentVersionIndex(newVersions.length - 1);
      
      return data.imageUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, originalImage, versions, currentVersionIndex, referenceImages, renderMode, dbUser, project]);

  // No region selection - using AI to understand location from prompt

  if (!isLoaded || isLoadingProject) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-4" />
          <p className="text-slate-600">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white flex-shrink-0 z-10">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/projects')}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{project?.name || 'Project'}</h1>
              <p className="text-xs text-slate-500">
                {versions.length} render{versions.length !== 1 ? 's' : ''}
                {isSaving && <span className="ml-2 text-violet-500">• Saving...</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Credits */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Coins className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-700">
                {dbUser?.credits ?? 0}
              </span>
            </div>
            
            {versions.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <History className="w-3 h-3" />
                v{currentVersionIndex + 1}/{versions.length}
              </div>
            )}
            
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Image Area */}
        <div className="flex-1 overflow-y-auto bg-slate-100 flex items-center justify-center p-4">
          {!originalImage ? (
            /* Upload prompt */
            <label className="cursor-pointer group">
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 transition-all group-hover:border-violet-400 group-hover:bg-violet-50/50 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <p className="text-slate-700 font-semibold text-lg">Upload a photo</p>
                <p className="text-sm text-slate-500 mt-1">PNG, JPG up to 10MB</p>
              </div>
            </label>
          ) : isLoading ? (
            /* Loading state */
            <div className="text-center">
              <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md">
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white animate-pulse" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Creating Your Render</h3>
                <p className="text-sm text-slate-500 mb-4">
                  {renderMode === 'pretty_render' ? 'Creating marketing-ready render...' : 'Transforming plan to render...'}
                </p>
              </div>
            </div>
          ) : (
            /* Editor */
            <div className="max-w-full max-h-full">
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-3">
                    {/* Mode Toggle */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setRenderMode('plan_to_render')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          renderMode === 'plan_to_render'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        📐 Plan to Render
                      </button>
                      <button
                        onClick={() => setRenderMode('pretty_render')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          renderMode === 'pretty_render'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        ✨ Pretty Render
                      </button>
                    </div>
                    
                    {/* Reference Images */}
                    <div className="relative">
                      <input
                        ref={referenceInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleReferenceUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => referenceInputRef.current?.click()}
                        disabled={referenceImages.length >= 5}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          referenceImages.length > 0
                            ? 'bg-amber-100 text-amber-700 border border-amber-300'
                            : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        {referenceImages.length > 0 ? `${referenceImages.length} Ref` : 'Add Reference'}
                      </button>
                    </div>
                  </div>
                  
                  {currentImage && versions.length > 0 && (
                    <div className="relative group">
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900">
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[140px]">
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = currentImage;
                            link.download = `${project?.name || 'render'}-v${currentVersionIndex + 1}.png`;
                            link.click();
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2"
                        >
                          <FileImage className="w-3.5 h-3.5 text-slate-500" />
                          PNG (Lossless)
                        </button>
                        <button
                          onClick={() => {
                            const img = new Image();
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = img.naturalWidth;
                              canvas.height = img.naturalHeight;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                ctx.fillStyle = '#ffffff';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0);
                                const jpgUrl = canvas.toDataURL('image/jpeg', 0.95);
                                const link = document.createElement('a');
                                link.href = jpgUrl;
                                link.download = `${project?.name || 'render'}-v${currentVersionIndex + 1}.jpg`;
                                link.click();
                              }
                            };
                            img.src = currentImage;
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 flex items-center gap-2"
                        >
                          <FileImage className="w-3.5 h-3.5 text-slate-500" />
                          JPG (Smaller)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Reference Images Preview */}
                {referenceImages.length > 0 && (
                  <div className="px-3 py-2 border-b border-slate-200 bg-amber-50">
                    <div className="flex items-center gap-2">
                      <Images className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700">References:</span>
                      <div className="flex gap-1.5 flex-1 overflow-x-auto">
                        {referenceImages.map((ref, idx) => (
                          <div key={ref.id} className="relative group flex-shrink-0">
                            <img src={ref.url} alt={`Ref ${idx + 1}`} className="w-10 h-10 object-cover rounded border border-amber-200" />
                            <button
                              onClick={() => removeReferenceImage(ref.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Image */}
                <div className="relative">
                  <img
                    src={currentImage || originalImage}
                    alt="Current"
                    className="max-w-full max-h-[65vh] object-contain"
                  />
                </div>

                {/* Version thumbnails */}
                {versions.length > 0 && (
                  <div className="px-3 py-2 border-t border-slate-200 bg-slate-50">
                    <div className="flex gap-2 overflow-x-auto">
                      <button
                        onClick={() => setCurrentVersionIndex(-1)}
                        className={`flex-shrink-0 w-16 rounded overflow-hidden border-2 transition-colors ${
                          currentVersionIndex === -1 ? 'border-violet-500' : 'border-transparent hover:border-slate-300'
                        }`}
                      >
                        <img src={originalImage!} alt="Original" className="w-full aspect-video object-cover" />
                        <p className="text-[9px] text-center py-0.5 bg-white text-slate-500">Original</p>
                      </button>
                      {versions.map((version, index) => (
                        <button
                          key={version.id}
                          onClick={() => setCurrentVersionIndex(index)}
                          className={`flex-shrink-0 w-16 rounded overflow-hidden border-2 transition-colors ${
                            currentVersionIndex === index ? 'border-violet-500' : 'border-transparent hover:border-slate-300'
                          }`}
                        >
                          <img src={version.imageUrl} alt={`v${version.id}`} className="w-full aspect-video object-cover" />
                          <p className="text-[9px] text-center py-0.5 bg-white text-slate-500">v{version.id}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Error display */}
              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <X className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-red-800 text-sm">Error</p>
                      <p className="text-red-600 text-xs mt-1">{error}</p>
                      <button
                        onClick={() => setError(null)}
                        className="mt-2 px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Chat Panel */}
        <div className="w-96 flex-shrink-0 h-full border-l border-slate-200">
          <ChatInterface
            imageLoaded={!!originalImage && renderReady}
            onGenerateRender={handleChatGenerate}
            isGenerating={isLoading}
            imageAnalysis={imageAnalysis}
            currentImageUrl={currentImage || originalImage || undefined}
            renderMode={renderMode}
          />
        </div>
      </div>
    </main>
  );
}

