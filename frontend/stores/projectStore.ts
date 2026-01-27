import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Version, Flaw, Mask, Tool, Point } from '@/lib/types';

interface ProjectState {
  // Project data
  project: Project | null;
  
  // UI state
  activeTool: Tool;
  isGenerating: boolean;
  selectedFlawId: string | null;
  currentMask: Mask | null;
  promptText: string;
  showWizard: boolean;
  
  // Canvas state
  canvasScale: number;
  canvasPosition: Point;
  
  // Actions
  createProject: (name: string, initialImageUrl: string) => void;
  setCurrentVersion: (versionId: string) => void;
  addVersion: (imageUrl: string, prompt: string, mask: Mask | null, parentId: string) => Version;
  
  // Tool actions
  setActiveTool: (tool: Tool) => void;
  setPromptText: (text: string) => void;
  setCurrentMask: (mask: Mask | null) => void;
  
  // Flaw actions
  addFlaw: (point: Point, description: string) => void;
  resolveFlaw: (flawId: string) => void;
  selectFlaw: (flawId: string | null) => void;
  
  // Generation
  setIsGenerating: (isGenerating: boolean) => void;
  
  // Wizard
  setShowWizard: (show: boolean) => void;
  
  // Canvas
  setCanvasScale: (scale: number) => void;
  setCanvasPosition: (position: Point) => void;
  
  // Helpers
  getCurrentVersion: () => Version | null;
  getVersionById: (id: string) => Version | null;
  getVersionHistory: () => Version[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  project: null,
  activeTool: 'select',
  isGenerating: false,
  selectedFlawId: null,
  currentMask: null,
  promptText: '',
  showWizard: false,
  canvasScale: 1,
  canvasPosition: { x: 0, y: 0 },
  
  // Create a new project with initial image
  createProject: (name, initialImageUrl) => {
    const projectId = uuidv4();
    const versionId = uuidv4();
    const now = new Date();
    
    const initialVersion: Version = {
      id: versionId,
      imageUrl: initialImageUrl,
      parentId: null,
      prompt: 'Original upload',
      mask: null,
      flaws: [],
      createdAt: now,
    };
    
    const project: Project = {
      id: projectId,
      name,
      versions: [initialVersion],
      currentVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    };
    
    set({ project });
  },
  
  setCurrentVersion: (versionId) => {
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          currentVersionId: versionId,
          updatedAt: new Date(),
        },
        currentMask: null,
        selectedFlawId: null,
      };
    });
  },
  
  addVersion: (imageUrl, prompt, mask, parentId) => {
    const versionId = uuidv4();
    const now = new Date();
    
    const newVersion: Version = {
      id: versionId,
      imageUrl,
      parentId,
      prompt,
      mask,
      flaws: [],
      createdAt: now,
    };
    
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          versions: [...state.project.versions, newVersion],
          currentVersionId: versionId,
          updatedAt: now,
        },
        currentMask: null,
        promptText: '',
      };
    });
    
    return newVersion;
  },
  
  setActiveTool: (tool) => set({ activeTool: tool }),
  setPromptText: (text) => set({ promptText: text }),
  setCurrentMask: (mask) => set({ currentMask: mask }),
  
  addFlaw: (point, description) => {
    set((state) => {
      if (!state.project) return state;
      
      const newFlaw: Flaw = {
        id: uuidv4(),
        point,
        description,
        resolved: false,
        createdAt: new Date(),
      };
      
      const updatedVersions = state.project.versions.map((v) => {
        if (v.id === state.project!.currentVersionId) {
          return { ...v, flaws: [...v.flaws, newFlaw] };
        }
        return v;
      });
      
      return {
        project: {
          ...state.project,
          versions: updatedVersions,
          updatedAt: new Date(),
        },
        selectedFlawId: newFlaw.id,
      };
    });
  },
  
  resolveFlaw: (flawId) => {
    set((state) => {
      if (!state.project) return state;
      
      const updatedVersions = state.project.versions.map((v) => {
        if (v.id === state.project!.currentVersionId) {
          return {
            ...v,
            flaws: v.flaws.map((f) =>
              f.id === flawId ? { ...f, resolved: true } : f
            ),
          };
        }
        return v;
      });
      
      return {
        project: {
          ...state.project,
          versions: updatedVersions,
          updatedAt: new Date(),
        },
      };
    });
  },
  
  selectFlaw: (flawId) => set({ selectedFlawId: flawId }),
  
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  
  setShowWizard: (show) => set({ showWizard: show }),
  
  setCanvasScale: (scale) => set({ canvasScale: scale }),
  setCanvasPosition: (position) => set({ canvasPosition: position }),
  
  getCurrentVersion: () => {
    const { project } = get();
    if (!project) return null;
    return project.versions.find((v) => v.id === project.currentVersionId) || null;
  },
  
  getVersionById: (id) => {
    const { project } = get();
    if (!project) return null;
    return project.versions.find((v) => v.id === id) || null;
  },
  
  getVersionHistory: () => {
    const { project } = get();
    if (!project) return [];
    
    // Build version tree starting from current version back to root
    const current = get().getCurrentVersion();
    if (!current) return [];
    
    const history: Version[] = [];
    let version: Version | null = current;
    
    while (version) {
      history.unshift(version);
      version = version.parentId
        ? project.versions.find((v) => v.id === version!.parentId) || null
        : null;
    }
    
    return history;
  },
}));

