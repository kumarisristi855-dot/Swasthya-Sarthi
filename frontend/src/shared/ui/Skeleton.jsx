import React from 'react';
import Card from './Card';

export function SkeletonLine({ className = '' }) {
  return <span className={`block h-3 animate-pulse rounded bg-care-neutral ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading results">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 animate-pulse rounded-lg bg-care-neutral" />
            <div className="flex-1 space-y-2">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-1/3" />
            </div>
          </div>
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-4/5" />
          <span className="block h-10 animate-pulse rounded-lg bg-care-neutral" />
        </Card>
      ))}
      <span className="sr-only">Loading healthcare results...</span>
    </div>
  );
}
