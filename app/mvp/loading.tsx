import { PageHeaderSkeleton, TableSkeleton } from "@/components/PageSkeletons";

export default function MvpLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <PageHeaderSkeleton />
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <TableSkeleton rows={8} />
      <TableSkeleton rows={8} />
    </div>
  </main>;
}
