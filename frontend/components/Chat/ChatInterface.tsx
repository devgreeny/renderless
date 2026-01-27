'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, RotateCcw, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
  timestamp: Date;
}

export interface GatheredInfo {
  intent?: string;
  targetDescription?: string;
  replacementDescription?: string;
  style?: string;
  additionalDetails?: string[];
}

interface ChatInterfaceProps {
  imageLoaded: boolean;
  onGenerateRender: (prompt: string, gatheredInfo: GatheredInfo) => Promise<string | null>;
  isGenerating?: boolean;
  imageAnalysis?: string;
  currentImageUrl?: string;
  renderMode: 'plan_to_render' | 'pretty_render';
}

export function ChatInterface({
  imageLoaded,
  onGenerateRender,
  isGenerating = false,
  imageAnalysis,
  currentImageUrl,
  renderMode,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [gatheredInfo, setGatheredInfo] = useState<GatheredInfo>({});
  const [generationCount, setGenerationCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isGeneratingRef = useRef(false);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation when image is loaded
  useEffect(() => {
    if (imageLoaded && messages.length === 0) {
      const modeText = renderMode === 'plan_to_render' 
        ? "I'll transform this into a render while keeping everything accurate to the original."
        : "I'll create a polished marketing render with some creative freedom.";
      
      const greeting: ChatMessage = {
        id: 'greeting',
        role: 'assistant',
        content: `Ready to create your render! ${modeText}\n\nDescribe any changes you'd like, or just say "render" to transform the image as-is.`,
        timestamp: new Date(),
      };
      setMessages([greeting]);
    }
  }, [imageLoaded, messages.length, renderMode]);

  // Send message to backend
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking || isGenerating) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsThinking(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          gathered_info: gatheredInfo,
          user_input: text.trim(),
          image_analysis: imageAnalysis || '',
          generation_count: generationCount,
          render_mode: renderMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      // Update gathered info
      if (data.updated_info) {
        setGatheredInfo(prev => ({ ...prev, ...data.updated_info }));
      }

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Handle generation action
      if (data.action === 'confirm_generate' && data.final_prompt) {
        if (isGeneratingRef.current) return;
        isGeneratingRef.current = true;

        // Add generating message
        const genMessage: ChatMessage = {
          id: `generating-${Date.now()}`,
          role: 'system',
          content: `Generating: "${data.final_prompt.slice(0, 100)}${data.final_prompt.length > 100 ? '...' : ''}"`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, genMessage]);

        // Trigger generation
        const mergedInfo = { ...gatheredInfo, ...data.updated_info };
        try {
          const result = await onGenerateRender(data.final_prompt, mergedInfo);
          if (result) {
            setGenerationCount(prev => prev + 1);
            // Success message
            const successMessage: ChatMessage = {
              id: `success-${Date.now()}`,
              role: 'assistant',
              content: "Done! Your render is ready. Want to make any adjustments?",
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, successMessage]);
          }
        } finally {
          isGeneratingRef.current = false;
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I had trouble processing that. Could you try again?",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  }, [messages, gatheredInfo, imageAnalysis, isThinking, isGenerating, onGenerateRender, generationCount, renderMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setGatheredInfo({});
    setGenerationCount(0);
    
    const greeting: ChatMessage = {
      id: 'greeting-reset',
      role: 'assistant',
      content: "Starting fresh! Describe what you'd like to change, or say \"render\" to transform as-is.",
      timestamp: new Date(),
    };
    setMessages([greeting]);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Render Assistant</h3>
            <p className="text-xs text-white/70">
              {renderMode === 'plan_to_render' ? '📐 Plan to Render' : '✨ Pretty Render'}
              {generationCount > 0 && ` • ${generationCount} created`}
            </p>
          </div>
        </div>
        {messages.length > 1 && (
          <button
            onClick={resetConversation}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Start over"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!imageLoaded ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 px-6">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
              <ImageIcon className="w-8 h-8 text-violet-500" />
            </div>
            <p className="font-medium text-slate-700 mb-1">
              {currentImageUrl ? "Processing image..." : "No image yet"}
            </p>
            <p className="text-sm text-slate-500">
              {currentImageUrl 
                ? "Analyzing your photo"
                : "Upload a photo on the left to start"}
            </p>
            {currentImageUrl && (
              <div className="mt-4">
                <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin mx-auto" />
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                {/* System messages (generation status) */}
                {message.role === 'system' && (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                    <span className="text-xs text-slate-500">{message.content}</span>
                  </div>
                )}
                
                {/* Message bubble */}
                {message.role !== 'system' && (
                  <div
                    className={clsx(
                      'max-w-[90%] rounded-2xl px-4 py-3',
                      message.role === 'assistant'
                        ? 'bg-slate-100 text-slate-900 rounded-tl-sm'
                        : 'bg-violet-500 text-white rounded-tr-sm ml-auto'
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                )}
              </div>
            ))}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="flex items-center gap-2 text-slate-500 pl-1">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs">Thinking...</span>
              </div>
            )}

            {/* Generating indicator */}
            {isGenerating && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                <span className="text-sm text-slate-600">
                  {renderMode === 'pretty_render' ? 'Creating marketing render...' : 'Transforming plan...'}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isGenerating ? "Generating..." : 
              imageLoaded ? "Describe changes or say 'render'..." : 
              "Upload an image first"
            }
            disabled={!imageLoaded || isThinking || isGenerating}
            className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl 
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                       disabled:bg-slate-100 disabled:text-slate-400"
          />
          <button
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim() || isThinking || isGenerating}
            className="px-4 py-2.5 bg-violet-500 text-white rounded-xl hover:bg-violet-600 
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
