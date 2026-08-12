import { PageHeaderSkeleton, TableSkeleton } from "@/components/PageSkeletons";

export default function GamesLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <PageHeaderSkeleton />
    <div className="mt-5 flex gap-2 overflow-x-auto border-b border-court/20 pb-2">
      {["All", "Live", "Scheduled", "Ready", "Completed"].map((label) => <div key={label} className="h-9 w-24 shrink-0 animate-pulse border border-line bg-white" />)}
    </div>
    <div className="mt-6 space-y-5">
      <TableSkeleton rows={5} />
      <TableSkeleton rows={4} />
    </div>
  </main>;
}
