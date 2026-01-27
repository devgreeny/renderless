export interface Point {
  x: number;
  y: number;
}

export interface Version {
  id: string;
  imageUrl: string;
  parentId: string | null;
  prompt: string;
  createdAt: Date;
  thumbnail?: string;
}

export interface Project {
  id: string;
  name: string;
  versions: Version[];
  currentVersionId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type Tool = 'select' | 'pan';

export interface CanvasState {
  scale: number;
  position: Point;
}

export interface GenerationRequest {
  prompt: string;
  imageBase64: string;
  renderMode: 'plan_to_render' | 'pretty_render';
  referenceImages?: string[];
}

export interface GenerationResponse {
  imageUrl: string;
  imageBase64: string;
}

// Render mode types
export type RenderMode = 'plan_to_render' | 'pretty_render';
