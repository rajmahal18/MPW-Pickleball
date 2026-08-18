import { redirect } from "next/navigation";
import { BarChart3, Eye, Monitor, MousePointer2, Smartphone, Tablet, Users, type LucideIcon } from "lucide-react";
import AdminNav from "@/components/AdminNav";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type CountRow = { count: bigint };
type PageRow = { path: string; views: bigint; visitors: bigint };
type DeviceRow = { deviceType: string; views: bigint };
type ReferrerRow = { referrerHost: string | null; views: bigint };
type HourRow = { bucket: Date; views: bigint; visitors: bigint };

const n = (value: bigint | number | null | undefined) => Number(value ?? 0);

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPERADMIN") redirect("/login");

  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, season: true } });
  if (!tournament) return <main className="admin-shell"><AdminNav role={user.role}/><div className="panel p-6">No tournament found.</div></main>;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [allViews, allVisitors, views24h, visitors24h, topPages, devices, referrers, hourly] = await Promise.all([
    prisma.pageView.count({ where: { tournamentId: tournament.id } }),
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(DISTINCT "visitorKey")::bigint AS count FROM "PageView" WHERE "tournamentId" = ${tournament.id}`,
    prisma.pageView.count({ where: { tournamentId: tournament.id, createdAt: { gte: since24h } } }),
    prisma.$queryRaw<CountRow[]>`SELECT COUNT(DISTINCT "visitorKey")::bigint AS count FROM "PageView" WHERE "tournamentId" = ${tournament.id} AND "createdAt" >= ${since24h}`,
    prisma.$queryRaw<PageRow[]>`
      SELECT "path", COUNT(*)::bigint AS views, COUNT(DISTINCT "visitorKey")::bigint AS visitors
      FROM "PageView"
      WHERE "tournamentId" = ${tournament.id} AND "createdAt" >= ${since24h}
      GROUP BY "path"
      ORDER BY views DESC, "path" ASC
      LIMIT 12
    `,
    prisma.$queryRaw<DeviceRow[]>`
      SELECT "deviceType", COUNT(*)::bigint AS views
      FROM "PageView"
      WHERE "tournamentId" = ${tournament.id} AND "createdAt" >= ${since24h}
      GROUP BY "deviceType"
      ORDER BY views DESC
    `,
    prisma.$queryRaw<ReferrerRow[]>`
      SELECT "referrerHost", COUNT(*)::bigint AS views
      FROM "PageView"
      WHERE "tournamentId" = ${tournament.id} AND "createdAt" >= ${since24h} AND "referrerHost" IS NOT NULL
      GROUP BY "referrerHost"
      ORDER BY views DESC
      LIMIT 8
    `,
    prisma.$queryRaw<HourRow[]>`
      SELECT date_trunc('hour', "createdAt") AS bucket, COUNT(*)::bigint AS views, COUNT(DISTINCT "visitorKey")::bigint AS visitors
      FROM "PageView"
      WHERE "tournamentId" = ${tournament.id} AND "createdAt" >= ${since24h}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
  ]);

  const maxHourlyViews = Math.max(1, ...hourly.map((row) => n(row.views)));
  const deviceTotal = Math.max(1, devices.reduce((sum, row) => sum + n(row.views), 0));

  return <main className="admin-shell">
    <AdminNav role={user.role}/>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="label">First-party traffic</div><h1 className="text-3xl font-black uppercase md:text-4xl">Visitor Analytics</h1><p className="mt-1 text-sm text-gray-500">Anonymous page traffic for {tournament.name} · {tournament.season}. No raw IPs, names, or full URLs are stored.</p></div>
      <span className="border border-line bg-white px-3 py-2 text-xs font-bold text-gray-500">Last 24 hours + all-time totals</span>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon={Eye} label="Page views · all time" value={allViews}/>
      <Stat icon={Users} label="Unique visitors · all time" value={n(allVisitors[0]?.count)}/>
      <Stat icon={MousePointer2} label="Page views · 24h" value={views24h}/>
      <Stat icon={BarChart3} label="Unique visitors · 24h" value={n(visitors24h[0]?.count)}/>
    </div>

    <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-line p-4"><div className="label text-court">Traffic curve</div><h2 className="text-xl font-black uppercase">Views by hour</h2></div>
        <div className="p-4">
          {hourly.length ? <div className="space-y-2">{hourly.map((row) => {
            const views = n(row.views); const visitors = n(row.visitors);
            return <div key={row.bucket.toISOString()} className="grid grid-cols-[82px_minmax(0,1fr)_72px] items-center gap-3 text-xs">
              <span className="font-bold text-gray-500">{row.bucket.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric" })}</span>
              <div className="h-7 overflow-hidden bg-gray-100"><div className="h-full bg-court/80" style={{ width: `${Math.max(3, (views / maxHourlyViews) * 100)}%` }}/></div>
              <span className="text-right font-black text-ink">{views} <span className="font-semibold text-gray-400">/ {visitors}</span></span>
            </div>;
          })}</div> : <Empty text="Traffic will appear here after public page views are recorded."/>}
          {hourly.length > 0 && <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">views / unique visitors</div>}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line p-4"><div className="label text-court">Devices · 24h</div><h2 className="text-xl font-black uppercase">Audience mix</h2></div>
        <div className="divide-y divide-line">{devices.length ? devices.map((row) => {
          const views = n(row.views);
          const pct = Math.round((views / deviceTotal) * 100);
          const Icon = row.deviceType === "MOBILE" ? Smartphone : row.deviceType === "TABLET" ? Tablet : Monitor;
          return <div key={row.deviceType} className="flex items-center gap-3 p-4">
            <Icon className="h-5 w-5 text-court"/>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3 text-sm"><strong>{prettyDevice(row.deviceType)}</strong><span className="font-black">{pct}%</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-court" style={{ width: `${pct}%` }}/></div>
            </div>
            <span className="text-xs text-gray-400">{views}</span>
          </div>;
        }) : <Empty text="No device data yet."/>}</div>
      </section>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <section className="panel overflow-hidden">
        <div className="border-b border-line p-4"><div className="label text-court">Discovery · 24h</div><h2 className="text-xl font-black uppercase">Most viewed pages</h2></div>
        <div className="divide-y divide-line">{topPages.length ? topPages.map((row, index) => <div key={row.path} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 p-3.5"><span className="font-black text-gray-400">{index + 1}</span><div className="min-w-0"><div className="truncate font-mono text-sm font-bold text-ink">{row.path}</div><div className="mt-0.5 text-xs text-gray-400">{n(row.visitors)} unique visitor{n(row.visitors) === 1 ? "" : "s"}</div></div><strong className="text-lg text-court">{n(row.views)}</strong></div>) : <Empty text="No page data yet."/>}</div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line p-4"><div className="label text-court">External discovery · 24h</div><h2 className="text-xl font-black uppercase">Referrers</h2></div>
        <div className="divide-y divide-line">{referrers.length ? referrers.map((row) => <div key={row.referrerHost || "direct"} className="flex items-center justify-between gap-3 p-3.5"><span className="truncate text-sm font-bold">{row.referrerHost}</span><strong className="text-court">{n(row.views)} views</strong></div>) : <Empty text="No external referrer data yet. Direct/internal traffic is intentionally not labeled as a referrer."/>}</div>
      </section>
    </div>
  </main>;
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return <div className="panel p-4"><div className="flex items-center justify-between gap-2"><span className="label">{label}</span><Icon className="h-4 w-4 text-court"/></div><div className="mt-2 text-3xl font-black text-ink">{value.toLocaleString()}</div></div>;
}

function Empty({ text }: { text: string }) { return <div className="p-6 text-center text-sm text-gray-500">{text}</div>; }
function prettyDevice(value: string) { return value === "MOBILE" ? "Mobile" : value === "TABLET" ? "Tablet" : "Desktop"; }
