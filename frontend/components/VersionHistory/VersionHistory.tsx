'use client';

import { useProjectStore } from '@/stores/projectStore';
import { Clock, GitBranch, AlertCircle, Check } from 'lucide-react';
import clsx from 'clsx';

export function VersionHistory() {
  const { project, setCurrentVersion, getVersionHistory } = useProjectStore();
  
  if (!project) {
    return (
      <div className="w-72 bg-white border-l border-sand-200 p-4">
        <div className="text-center text-sand-400 py-8">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No project loaded</p>
        </div>
      </div>
    );
  }
  
  const history = getVersionHistory();
  const allVersions = project.versions;
  
  return (
    <div className="w-72 bg-white border-l border-sand-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-sand-200">
        <h2 className="font-semibold text-sand-800 flex items-center gap-2">
          <GitBranch className="w-4 h-4" />
          Version History
        </h2>
        <p className="text-xs text-sand-500 mt-1">
          {allVersions.length} version{allVersions.length !== 1 ? 's' : ''}
        </p>
      </div>
      
      {/* Version List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {allVersions.map((version, index) => {
            const isCurrent = version.id === project.currentVersionId;
            const unresolvedFlaws = version.flaws.filter(f => !f.resolved).length;
            
            return (
              <button
                key={version.id}
                onClick={() => setCurrentVersion(version.id)}
                className={clsx(
                  'w-full text-left rounded-lg p-3 transition-all duration-200',
                  isCurrent
                    ? 'bg-accent-50 border-2 border-accent-200'
                    : 'bg-sand-50 border-2 border-transparent hover:bg-sand-100 hover:border-sand-200'
                )}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-sand-200 rounded-md mb-2 overflow-hidden">
                  <img
                    src={version.imageUrl}
                    alt={`Version ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Version Info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx(
                        'text-xs font-medium px-1.5 py-0.5 rounded',
                        isCurrent ? 'bg-accent-200 text-accent-700' : 'bg-sand-200 text-sand-600'
                      )}>
                        v{index + 1}
                      </span>
                      {isCurrent && (
                        <span className="text-xs text-accent-600 font-medium">Current</span>
                      )}
                    </div>
                    <p className="text-xs text-sand-600 mt-1 truncate" title={version.prompt}>
                      {version.prompt}
                    </p>
                  </div>
                  
                  {/* Flaw indicator */}
                  {unresolvedFlaws > 0 && (
                    <div className="flex items-center gap-1 text-accent-500" title={`${unresolvedFlaws} unresolved flaw${unresolvedFlaws !== 1 ? 's' : ''}`}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{unresolvedFlaws}</span>
                    </div>
                  )}
                  
                  {version.flaws.length > 0 && unresolvedFlaws === 0 && (
                    <div className="text-success-500" title="All flaws resolved">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
                
                {/* Timestamp */}
                <p className="text-[10px] text-sand-400 mt-2">
                  {version.createdAt.toLocaleString()}
                </p>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Branch Info */}
      {history.length > 1 && (
        <div className="p-3 border-t border-sand-200 bg-sand-50">
          <p className="text-xs text-sand-500 flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            {history.length} steps from original
          </p>
        </div>
      )}
    </div>
  );
}

