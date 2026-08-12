import { PageHeaderSkeleton, TableSkeleton } from "@/components/PageSkeletons";

export default function GroupsLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <PageHeaderSkeleton />
    <div className="mt-6 grid gap-5 lg:grid-cols-3">
      <TableSkeleton rows={4} />
      <TableSkeleton rows={4} />
      <TableSkeleton rows={4} />
    </div>
  </main>;
}
