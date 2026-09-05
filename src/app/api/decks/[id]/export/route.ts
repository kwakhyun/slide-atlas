import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { slideSvg } from "@/lib/svg";
import { workspaceRoute } from "@/server/http";
import { getDeck, getDeckTemplates } from "@/server/repository";
import { resolveSlideTemplate } from "@/lib/template-version";
import { exportPptx } from "@/server/pptx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, context: Context) {
  return workspaceRoute(req, async (db, workspaceId) => {
    const { id } = await context.params;
    const deck = await getDeck(db, workspaceId, id);
    const format = z
      .enum(["json", "svg", "pptx"])
      .parse(req.nextUrl.searchParams.get("format") ?? "json");
    const templates = await getDeckTemplates(db, workspaceId, [deck]);
    if (format === "svg") {
      const index = z.coerce
        .number()
        .int()
        .min(0)
        .max(deck.slides.length - 1)
        .parse(req.nextUrl.searchParams.get("slide") ?? 0);
      const slide = deck.slides[index];
      const template = resolveSlideTemplate(slide, templates);
      return new NextResponse(
        slideSvg(slide, template, { slideNumber: index + 1 }),
        {
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Content-Disposition": `attachment; filename="slide-atlas-${index + 1}.svg"`,
          },
        },
      );
    }
    if (format === "pptx")
      return new NextResponse((await exportPptx(deck, templates)) as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": "attachment; filename=slide-atlas.pptx",
        },
      });
    return new NextResponse(
      JSON.stringify(
        {
          schemaVersion: "1.0",
          deck,
          templates: templates.filter((template) =>
            deck.slides.some((slide) => slide.templateId === template.id),
          ),
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": "attachment; filename=slide-atlas.json",
        },
      },
    );
  });
}
