import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/auth/signout
// Body: { deviceToken }
//
// Unbinds a device from its account by deleting the
// user_device_tokens row. The users row — and any email / Discord
// link on it — is left intact, so the account can be signed back
// into from /auth. The client clears its local device token after
// this and bootstraps a fresh device-only identity.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    deviceToken?: string;
  };
  const deviceToken = body.deviceToken?.trim();
  if (!deviceToken) {
    return NextResponse.json(
      { error: "deviceToken required" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("user_device_tokens")
    .delete()
    .eq("device_token", deviceToken);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
