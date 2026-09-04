import { NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { apiRoute } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(req: NextRequest) {
  return apiRoute(req, async () => {
    throw new AppError(404, "NOT_FOUND", "요청한 API를 찾을 수 없습니다.");
  });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
