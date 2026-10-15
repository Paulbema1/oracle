import { authRequired, isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({ required: authRequired(), ok: isAuthorized(req) });
}
