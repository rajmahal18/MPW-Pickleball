export function BlockSkeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 ${className}`} aria-hidden="true" />;
}

export function PageHeaderSkeleton() {
  return <div className="space-y-3">
    <BlockSkeleton className="h-3 w-28" />
    <BlockSkeleton className="h-10 w-64 max-w-full" />
    <BlockSkeleton className="h-4 w-full max-w-2xl" />
  </div>;
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: count }).map((_, index) => <div key={index} className="border border-line bg-white p-4">
      <div className="flex items-center gap-3">
        <BlockSkeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <BlockSkeleton className="h-3 w-24" />
          <BlockSkeleton className="h-5 w-40 max-w-full" />
        </div>
      </div>
      <BlockSkeleton className="mt-4 h-4 w-full" />
      <BlockSkeleton className="mt-2 h-4 w-2/3" />
    </div>)}
  </div>;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="overflow-hidden border border-line bg-white">
    <BlockSkeleton className="h-10 w-full bg-ink/20" />
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, index) => <div key={index} className="grid grid-cols-[48px_1fr_80px] gap-3 p-3">
        <BlockSkeleton className="h-5 w-8" />
        <BlockSkeleton className="h-5 w-full" />
        <BlockSkeleton className="h-5 w-16" />
      </div>)}
    </div>
  </div>;
}
