import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";

export const PUBLIC_PREVIEW_COOKIE = "mpw_public_preview";

export const isPrivateDivisionPreviewEnabled = cache(async function isPrivateDivisionPreviewEnabled() {
  const [user, store] = await Promise.all([getCurrentUser(), cookies()]);
  return user?.role === "SUPERADMIN" && store.get(PUBLIC_PREVIEW_COOKIE)?.value === "1";
});

export async function publicDivisionFilter() {
  return (await isPrivateDivisionPreviewEnabled()) ? {} : { isPublic: true as const };
}
