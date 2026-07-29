import { NextResponse } from "next/server";
import { readAvatar } from "@/lib/avatar-storage";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await params;
    const avatar = await readAvatar(file);
    return new NextResponse(avatar.bytes, { headers: { "Content-Type": avatar.contentType, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
