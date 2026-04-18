import { NextResponse } from "next/server";
import { fetchRoomView } from "@/lib/room-state";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId");

  const view = await fetchRoomView(code.toUpperCase(), playerId);
  if (!view) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }
  return NextResponse.json(view);
}
