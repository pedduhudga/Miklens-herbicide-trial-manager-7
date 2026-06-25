import React from 'react';

// Base skeleton animation class
const skeletonClass = "animate-pulse bg-slate-200 rounded";

// Reusable skeleton primitives
export function SkeletonBox({ className = "", width = "w-full", height = "h-4" }) {
  return <div className={`${skeletonClass} ${width} ${height} ${className}`}></div>;
}

export function SkeletonCard({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border border-slate-100 ${className}`}>
      {children}
    </div>
  );
}

// Dashboard skeleton - matches StatCard layout and charts
export function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Top bar skeleton */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <SkeletonBox width="w-32" height="h-6" />
          <div className="flex gap-2">
            <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
            <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Stats cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i}>
              <div className="flex items-center gap-4">
                <SkeletonBox width="w-12" height="h-12" className="rounded-xl" />
                <div className="flex-1 space-y-2">
                  <SkeletonBox width="w-16" height="h-8" />
                  <SkeletonBox width="w-24" height="h-3" />
                  <SkeletonBox width="w-20" height="h-3" />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column - charts */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chart card */}
            <SkeletonCard>
              <div className="space-y-4">
                <SkeletonBox width="w-48" height="h-6" />
                <SkeletonBox width="w-full" height="h-64" className="rounded-lg" />
              </div>
            </SkeletonCard>

            {/* Another chart */}
            <SkeletonCard>
              <div className="space-y-4">
                <SkeletonBox width="w-40" height="h-6" />
                <SkeletonBox width="w-full" height="h-48" className="rounded-lg" />
              </div>
            </SkeletonCard>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Weather/advisor card */}
            <SkeletonCard>
              <div className="space-y-4">
                <SkeletonBox width="w-32" height="h-6" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="text-center space-y-2">
                      <SkeletonBox width="w-8" height="h-8" className="rounded-full mx-auto" />
                      <SkeletonBox width="w-12" height="h-4" className="mx-auto" />
                      <SkeletonBox width="w-16" height="h-3" className="mx-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </SkeletonCard>

            {/* Recent items list */}
            <SkeletonCard>
              <div className="space-y-4">
                <SkeletonBox width="w-24" height="h-6" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <SkeletonBox width="w-2" height="h-8" />
                      <div className="flex-1 space-y-1">
                        <SkeletonBox width="w-full" height="h-4" />
                        <SkeletonBox width="w-24" height="h-3" />
                      </div>
                      <SkeletonBox width="w-4" height="h-4" />
                    </div>
                  ))}
                </div>
              </div>
            </SkeletonCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trials skeleton - matches trial cards grid layout
export function TrialsSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Top bar skeleton */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <SkeletonBox width="w-24" height="h-6" />
          <div className="flex gap-2">
            <SkeletonBox width="w-32" height="h-9" className="rounded-lg" />
            <SkeletonBox width="w-20" height="h-9" className="rounded-lg" />
            <SkeletonBox width="w-24" height="h-9" className="rounded-lg" />
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-4">
          <SkeletonBox width="w-64" height="h-10" className="rounded-lg" />
          <SkeletonBox width="w-32" height="h-10" className="rounded-lg" />
          <SkeletonBox width="w-32" height="h-10" className="rounded-lg" />
          <SkeletonBox width="w-24" height="h-10" className="rounded-lg" />
        </div>
      </div>

      <div className="p-4">
        {/* Trial cards grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <SkeletonBox width="w-48" height="h-5" />
                  <SkeletonBox width="w-32" height="h-4" />
                </div>
                <SkeletonBox width="w-16" height="h-6" className="rounded-full" />
              </div>
              
              {/* Content rows */}
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex justify-between items-center">
                    <SkeletonBox width="w-20" height="h-4" />
                    <SkeletonBox width="w-24" height="h-4" />
                  </div>
                ))}
              </div>

              {/* Photo thumbnails */}
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <SkeletonBox key={j} width="w-12" height="h-12" className="rounded-lg" />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <SkeletonBox width="w-8" height="h-8" className="rounded" />
                <SkeletonBox width="w-8" height="h-8" className="rounded" />
                <SkeletonBox width="w-8" height="h-8" className="rounded" />
                <div className="flex-1"></div>
                <SkeletonBox width="w-16" height="h-8" className="rounded" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// Analytics skeleton - matches charts and stats layout
export function AnalyticsSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Top bar skeleton */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <SkeletonBox width="w-28" height="h-6" />
          <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-2">
              <SkeletonBox width="w-20" height="h-3" />
              <SkeletonBox width="w-16" height="h-8" />
              <SkeletonBox width="w-24" height="h-3" />
            </SkeletonCard>
          ))}
        </div>

        {/* Charts grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-4">
              <div className="flex items-center justify-between">
                <SkeletonBox width="w-40" height="h-6" />
                <SkeletonBox width="w-6" height="h-6" />
              </div>
              <SkeletonBox width="w-full" height="h-64" className="rounded-lg" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// Reports skeleton - matches report builder layout
export function ReportsSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Top bar skeleton */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <SkeletonBox width="w-24" height="h-6" />
          <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Tab navigation */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <SkeletonBox width="w-24" height="h-8" className="rounded-md" />
          <SkeletonBox width="w-20" height="h-8" className="rounded-md" />
        </div>

        {/* Main content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left panel - options */}
          <div className="space-y-4">
            <SkeletonCard className="space-y-4">
              <SkeletonBox width="w-32" height="h-6" />
              <SkeletonBox width="w-full" height="h-10" className="rounded-lg" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <SkeletonBox width="w-4" height="h-4" className="rounded" />
                    <SkeletonBox width="w-20" height="h-4" />
                  </div>
                ))}
              </div>
              <SkeletonBox width="w-full" height="h-10" className="rounded-lg" />
            </SkeletonCard>
          </div>

          {/* Right panel - template builder */}
          <div className="lg:col-span-2">
            <SkeletonCard className="space-y-4">
              <SkeletonBox width="w-40" height="h-6" />
              
              {/* Template blocks */}
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <SkeletonBox width="w-6" height="h-6" />
                    <div className="flex-1 space-y-1">
                      <SkeletonBox width="w-48" height="h-4" />
                      <SkeletonBox width="w-24" height="h-3" />
                    </div>
                    <SkeletonBox width="w-6" height="h-6" />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-200">
                <SkeletonBox width="w-32" height="h-10" className="rounded-lg" />
                <SkeletonBox width="w-24" height="h-10" className="rounded-lg" />
              </div>
            </SkeletonCard>
          </div>
        </div>
      </div>
    </div>
  );
}

// AI Assistant skeleton - matches chat layout
export function AIAssistantSkeleton() {
  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Top bar skeleton */}
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <SkeletonBox width="w-32" height="h-6" />
          <div className="flex gap-2">
            <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
            <SkeletonBox width="w-8" height="h-8" className="rounded-lg" />
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* Chat messages */}
        <div className="flex-1 p-4 space-y-4 overflow-auto">
          {/* AI message */}
          <div className="flex gap-3">
            <SkeletonBox width="w-8" height="h-8" className="rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBox width="w-full" height="h-4" />
              <SkeletonBox width="w-3/4" height="h-4" />
              <SkeletonBox width="w-1/2" height="h-4" />
            </div>
          </div>

          {/* User message */}
          <div className="flex gap-3 justify-end">
            <div className="flex-1 max-w-sm space-y-2 text-right">
              <SkeletonBox width="w-full" height="h-4" className="ml-auto" />
              <SkeletonBox width="w-2/3" height="h-4" className="ml-auto" />
            </div>
            <SkeletonBox width="w-8" height="h-8" className="rounded-full flex-shrink-0" />
          </div>

          {/* AI message with chart */}
          <div className="flex gap-3">
            <SkeletonBox width="w-8" height="h-8" className="rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-3">
              <SkeletonBox width="w-full" height="h-4" />
              <SkeletonBox width="w-2/3" height="h-4" />
              <SkeletonBox width="w-full" height="h-32" className="rounded-lg" />
            </div>
          </div>
        </div>

        {/* Chat input */}
        <div className="border-t border-slate-200 bg-white p-4">
          <div className="flex gap-3">
            <SkeletonBox width="w-full" height="h-10" className="rounded-lg" />
            <SkeletonBox width="w-10" height="h-10" className="rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}