import { NextRequest } from "next/server";
import { invariant } from "@/server/errors";
import { json, workspaceRoute } from "@/server/http";
import { rateLimit } from "@/server/repository";
import { extractPptxTemplates, PPTX_MAX_BYTES } from "@/server/pptx-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export function POST(req: NextRequest) {
  return workspaceRoute(req, async (db, workspaceId) => {
    invariant(
      req.headers.get("content-type")?.includes("multipart/form-data"),
      415,
      "FORM_REQUIRED",
      "PowerPoint 파일을 multipart/form-data로 보내 주세요.",
    );
    invariant(
      Number(req.headers.get("content-length") ?? 0) <=
        PPTX_MAX_BYTES + 512_000,
      413,
      "PPTX_SIZE_LIMIT",
      "PowerPoint 파일은 8MB 이하여야 합니다.",
    );
    await rateLimit(db, workspaceId, "extract", 12);
    const form = await req.formData();
    const file = form.get("file");
    invariant(
      file &&
        typeof file !== "string" &&
        typeof file.arrayBuffer === "function",
      400,
      "PPTX_REQUIRED",
      "분석할 PowerPoint 파일을 선택해 주세요.",
    );
    invariant(
      file.name.toLowerCase().endsWith(".pptx"),
      415,
      "PPTX_REQUIRED",
      ".pptx 형식만 분석할 수 있습니다.",
    );
    invariant(
      file.size <= PPTX_MAX_BYTES,
      413,
      "PPTX_SIZE_LIMIT",
      "PowerPoint 파일은 8MB 이하여야 합니다.",
    );
    return json(
      extractPptxTemplates(
        new Uint8Array(await file.arrayBuffer()),
        file.name.slice(0, 160),
      ),
    );
  });
}
