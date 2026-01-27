import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Client-side Supabase client (only create if configured)
export const supabase: SupabaseClient | null = 
  supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;

// Check if Supabase is configured
export const isSupabaseConfigured = () => !!supabase;

// Types for our database
export interface User {
  id: string;
  clerk_id: string;
  email: string;
  credits: number;
  total_renders: number;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  original_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Render {
  id: string;
  project_id: string;
  version: number;
  image_url: string;
  prompt: string;
  mode: 'edit' | 'reimagine';
  lifestyle_preset: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

// Helper functions
export async function getOrCreateUser(clerkId: string, email: string): Promise<User | null> {
  if (!supabase) {
    console.warn('Supabase not configured');
    return null;
  }
  
  // First, try to get existing user
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', clerkId)
    .single();

  if (existingUser) {
    return existingUser;
  }

  // Create new user with default credits
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      clerk_id: clerkId,
      email: email,
      credits: 100, // Default starting credits
      total_renders: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error);
    return null;
  }

  return newUser;
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  return data || [];
}

export async function createProject(userId: string, name: string, originalImageUrl?: string): Promise<Project | null> {
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: name,
      original_image_url: originalImageUrl,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating project:', error);
    return null;
  }

  return data;
}

export async function getProjectRenders(projectId: string): Promise<Render[]> {
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('renders')
    .select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: true });

  if (error) {
    console.error('Error fetching renders:', error);
    return [];
  }

  return data || [];
}

export async function saveRender(
  projectId: string,
  imageUrl: string,
  prompt: string,
  mode: 'edit' | 'reimagine',
  lifestylePreset: string | null,
  settings: Record<string, unknown>
): Promise<Render | null> {
  if (!supabase) return null;
  
  // Get current max version
  const { data: existingRenders } = await supabase
    .from('renders')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1);

  const nextVersion = existingRenders && existingRenders.length > 0 
    ? existingRenders[0].version + 1 
    : 1;

  const { data, error } = await supabase
    .from('renders')
    .insert({
      project_id: projectId,
      version: nextVersion,
      image_url: imageUrl,
      prompt: prompt,
      mode: mode,
      lifestyle_preset: lifestylePreset,
      settings: settings,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving render:', error);
    return null;
  }

  // Update project thumbnail and updated_at
  await supabase
    .from('projects')
    .update({ 
      thumbnail_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  return data;
}

export async function deductCredit(userId: string): Promise<boolean> {
  if (!supabase) return false;
  
  const { data: user } = await supabase
    .from('users')
    .select('credits')
    .eq('id', userId)
    .single();

  if (!user || user.credits <= 0) {
    return false;
  }

  const { error } = await supabase
    .from('users')
    .update({ 
      credits: user.credits - 1,
    })
    .eq('id', userId);

  return !error;
}

export async function uploadImage(
  bucket: string,
  path: string,
  base64Data: string
): Promise<string | null> {
  if (!supabase) return null;
  
  // Convert base64 to blob
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.error('Error uploading image:', error);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return publicUrl;
}

export async function deleteProject(projectId: string): Promise<boolean> {
  if (!supabase) return false;
  
  // Delete all renders first
  await supabase
    .from('renders')
    .delete()
    .eq('project_id', projectId);

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  return !error;
}

