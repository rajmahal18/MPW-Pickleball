import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/PageSkeletons";

export default function Loading() {
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <PageHeaderSkeleton />
    <div className="mt-6">
      <CardGridSkeleton count={6} />
    </div>
  </main>;
}
