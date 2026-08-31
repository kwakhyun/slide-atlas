import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { exportPptx } from "@/server/pptx";
import { buildDeterministicDeck } from "@/lib/generate";
import { SEED_TEMPLATES, EXAMPLE_BRIEF } from "@/lib/catalog";

describe("editable PowerPoint export", () => {
  it("writes an OPC package with one editable slide and source note per slide", async () => {
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "midnight",
      4,
    );
    const files = unzipSync(await exportPptx(deck, SEED_TEMPLATES));
    expect(files["[Content_Types].xml"]).toBeDefined();
    expect(files["ppt/presentation.xml"]).toBeDefined();
    expect(
      Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)),
    ).toHaveLength(4);
    const slide = strFromU8(files["ppt/slides/slide1.xml"]);
    expect(slide).toContain("<p:txBody>");
    expect(slide).toContain("<a:t>");
    expect(slide).not.toContain("<p:pic>");
    const note = strFromU8(files["ppt/notesSlides/notesSlide1.xml"]);
    expect(note).toContain("Template:");
    expect(note).toContain("실제 고객 성과가 아닙니다.");
    expect(Object.keys(files).some((p) => /vba|macro|external/i.test(p))).toBe(
      false,
    );
  });
  it("escapes XML injection in editable text", async () => {
    const deck = buildDeterministicDeck(
      EXAMPLE_BRIEF,
      SEED_TEMPLATES,
      "paper",
      1,
    );
    deck.slides[0].values.title = '<unsafe name="yes"> & text';
    const files = unzipSync(await exportPptx(deck, SEED_TEMPLATES));
    const xml = strFromU8(files["ppt/slides/slide1.xml"]);
    expect(xml).not.toContain("<unsafe");
    expect(xml).toContain("&lt;unsafe");
    expect(xml).toContain("&amp;");
  });
});
