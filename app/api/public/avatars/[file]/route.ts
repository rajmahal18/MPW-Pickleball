import { NextResponse } from "next/server";
import { openAvatar } from "@/lib/avatar-storage";

export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await params;
    const avatar = await openAvatar(file);
    return new NextResponse(avatar.stream, {
      headers: {
        "Content-Type": avatar.contentType,
        "Content-Length": String(avatar.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
