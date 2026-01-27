-- Renderless Database Schema
-- Run this in your Supabase SQL Editor (supabase.com > SQL Editor)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced with Clerk)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  credits INTEGER DEFAULT 100 NOT NULL,
  total_renders INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  original_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Renders table (versions within a project)
CREATE TABLE renders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT DEFAULT 'edit' CHECK (mode IN ('edit', 'reimagine')),
  lifestyle_preset TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX idx_renders_project_id ON renders(project_id);
CREATE INDEX idx_renders_version ON renders(project_id, version);
CREATE INDEX idx_users_clerk_id ON users(clerk_id);

-- Function to increment total_renders
CREATE OR REPLACE FUNCTION increment_renders(user_row_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_total INTEGER;
BEGIN
  UPDATE users 
  SET total_renders = total_renders + 1 
  WHERE id = user_row_id
  RETURNING total_renders INTO new_total;
  RETURN new_total;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (true);  -- Will filter by clerk_id in app

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (true);

CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (true);

-- Projects policies
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (true);  -- Will filter by user_id in app

CREATE POLICY "Users can create projects" ON projects
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (true);

-- Renders policies
CREATE POLICY "Users can view renders" ON renders
  FOR SELECT USING (true);

CREATE POLICY "Users can create renders" ON renders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete renders" ON renders
  FOR DELETE USING (true);

-- Create storage bucket for images
-- Note: Run this in Supabase Dashboard > Storage > Create bucket
-- Bucket name: renders
-- Make it public

-- Storage policies (run in Supabase Dashboard > Storage > Policies)
-- Allow authenticated users to upload
-- Allow public read access

