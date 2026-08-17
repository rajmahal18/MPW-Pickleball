import { redirect } from "next/navigation";
import TournamentCountdown from "@/components/TournamentCountdown";
import { getCurrentUser } from "@/lib/auth";
import { isPublicLaunchOpen, publicLaunchAtIso } from "@/lib/public-launch";

export const dynamic = "force-dynamic";

export default async function CountdownPage() {
  const user = await getCurrentUser();
  if (user || isPublicLaunchOpen()) redirect("/");
  return <TournamentCountdown launchAt={publicLaunchAtIso()} serverNow={Date.now()}/>;
}
