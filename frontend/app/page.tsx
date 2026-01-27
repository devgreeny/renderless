'use client';

import { useEffect } from 'react';
import { useUser, SignInButton, SignUpButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Sparkles, Upload, Palette, Zap, ArrowRight, Check } from 'lucide-react';

export default function LandingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  // Redirect logged-in users to projects
  useEffect(() => {
    if (isLoaded && user) {
      router.push('/projects');
    }
  }, [isLoaded, user, router]);

  // Show loading while checking auth
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Landing page for non-authenticated users
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Renderless</span>
          </div>
          <div className="flex items-center gap-3">
            <SignInButton mode="modal">
              <button className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
                Get Started
              </button>
            </SignUpButton>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Architectural Visualization
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Transform Photos into<br />
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              Stunning Renders
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Upload a photo, describe your vision, and watch AI create professional 
            architectural renders in seconds. No 3D modeling required.
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <SignUpButton mode="modal">
              <button className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl hover:from-violet-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg shadow-violet-500/25">
                Start Creating
                <ArrowRight className="w-5 h-5" />
              </button>
            </SignUpButton>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Reference Images</h3>
            <p className="text-slate-400">
              Upload examples of what you want to add. The AI matches your reference style perfectly.
            </p>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
              <Palette className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Creative Modes</h3>
            <p className="text-slate-400">
              Edit precisely or reimagine freely. You control how much creative liberty the AI takes.
            </p>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Lifestyle Presets</h3>
            <p className="text-slate-400">
              One-click to add people, activity, and atmosphere. Marketing-ready renders instantly.
            </p>
          </div>
        </div>

        {/* How it Works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-12">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Upload', desc: 'Drop your site photo' },
              { step: '2', title: 'Describe', desc: 'Tell AI what to change' },
              { step: '3', title: 'Generate', desc: 'AI creates your render' },
              { step: '4', title: 'Export', desc: 'Download in high resolution' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-violet-600 text-white font-bold text-lg flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h4 className="font-semibold text-white mb-1">{item.title}</h4>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Teaser */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center backdrop-blur-sm">
          <h3 className="text-2xl font-bold text-white mb-4">Simple Credit-Based Pricing</h3>
          <p className="text-slate-400 mb-6 max-w-lg mx-auto">
            Each render costs 1 credit. Get started with 100 free credits.
          </p>
          <div className="flex items-center justify-center gap-6 text-sm text-slate-300">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              No subscription required
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              Pay as you go
            </span>
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              High-resolution exports
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-slate-500 text-sm">
          © 2026 Renderless. AI-powered architectural visualization.
        </div>
      </footer>
    </div>
  );
}
