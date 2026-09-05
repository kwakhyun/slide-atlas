import { NextRequest } from "next/server";
import { apiRoute, json } from "@/server/http";
import { getDatabase } from "@/server/database";
import { digest } from "@/server/team";
import { invariant } from "@/server/errors";
export const runtime = "nodejs";
export function GET(
  req: NextRequest,
  c: { params: Promise<{ token: string }> },
) {
  return apiRoute(req, async () => {
    const { token } = await c.params;
    invariant(
      /^[\w-]{43}$/.test(token),
      404,
      "NOT_FOUND",
      "공유를 찾을 수 없습니다.",
    );
    const db = await getDatabase(),
      { rows } = await db.query<{ data: unknown }>(
        "SELECT data FROM deck_shares WHERE token_hash=$1 AND NOT revoked AND expires_at>NOW()",
        [digest(token)],
      );
    invariant(rows[0], 404, "NOT_FOUND", "만료되었거나 해제된 공유입니다.");
    const response = json(rows[0].data);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  });
}
