import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/PageSkeletons";

export default function FanFavoriteLoading() {
  return <main className="mx-auto max-w-7xl px-4 py-8">
    <PageHeaderSkeleton />
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.9fr]">
      <CardGridSkeleton count={4} />
      <CardGridSkeleton count={3} />
    </div>
  </main>;
}
