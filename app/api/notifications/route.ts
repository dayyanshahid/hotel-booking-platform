import { localeFrom, ok, readJson } from "@/lib/server/api";
import { listNotifications, markNotificationsRead } from "@/lib/server/store";

/** GET /api/notifications?channel=email — booking, price and service events (§5.12). */
export async function GET(req: Request) {
  const channel = (new URL(req.url).searchParams.get("channel") ?? "").toLowerCase();
  return ok({ notifications: channel ? await listNotifications(channel) : [] });
}

export async function POST(req: Request) {
  localeFrom(req);
  const body = await readJson<{ channel: string }>(req);
  if (body?.channel) await markNotificationsRead(body.channel.toLowerCase());
  return ok({ marked: true });
}

export const dynamic = "force-dynamic";
