import { strToU8, zipSync } from "fflate";
import { type Deck, type SlideTemplate, themeTokens } from "@/lib/domain";
import { escapeXml } from "@/lib/svg";
import { wrapText } from "@/lib/quality";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const GROUP =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const emu = (px: number) => Math.round(px * 7620);
const rgb = (hex: string) => hex.slice(1).toUpperCase();
const rels = (items: Array<[string, string, string]>) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join("")}</Relationships>`;
function shape(
  id: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  kind = "rect",
) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="${kind}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${rgb(color)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}
function textBox(
  id: number,
  name: string,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  color: string,
  bold = false,
  notes = false,
) {
  const paragraphs = wrapText(text, w, fontSize)
    .map(
      (line) =>
        `<a:p><a:pPr><a:lnSpc><a:spcPct val="125000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="ko-KR" sz="${Math.round(fontSize * 60)}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${rgb(color)}"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr>${notes ? '<p:ph type="body" idx="1"/>' : ""}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

/** Editable OOXML text and geometry. No external media, macros, or image parsers. */
export async function exportPptx(
  deck: Deck,
  templates: SlideTemplate[],
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, content: string) => {
    files[name] = strToU8(content);
  };
  const overrides: Array<[string, string]> = [
    ["/ppt/presentation.xml", "presentationml.presentation.main"],
    ["/ppt/slideMasters/slideMaster1.xml", "presentationml.slideMaster"],
    ["/ppt/slideLayouts/slideLayout1.xml", "presentationml.slideLayout"],
    ["/ppt/theme/theme1.xml", "theme"],
  ];
  add(
    "_rels/.rels",
    rels([["rId1", "officeDocument", "ppt/presentation.xml"]]),
  );
  add(
    "ppt/presentation.xml",
    `${XML}<p:presentation ${A} ${P} ${R}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${deck.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`,
  );
  add(
    "ppt/_rels/presentation.xml.rels",
    rels([
      ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
      ...deck.slides.map((_, i): [string, string, string] => [
        `rId${i + 2}`,
        "slide",
        `slides/slide${i + 1}.xml`,
      ]),
    ]),
  );
  const clrMap =
    '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
  add(
    "ppt/slideMasters/slideMaster1.xml",
    `${XML}<p:sldMaster ${A} ${P} ${R}><p:cSld><p:spTree>${GROUP}</p:spTree></p:cSld>${clrMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
  );
  add(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    rels([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
      ["rId2", "theme", "../theme/theme1.xml"],
    ]),
  );
  add(
    "ppt/slideLayouts/slideLayout1.xml",
    `${XML}<p:sldLayout ${A} ${P} ${R} type="blank" preserve="1"><p:cSld name="Atlas Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  add(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]),
  );
  const colors: Record<string, string> = {
    dk1: "252923",
    lt1: "FFFFFF",
    dk2: "25382F",
    lt2: "F4F0E9",
    accent1: "C6452C",
    accent2: "365E43",
    accent3: "3156BB",
    accent4: "D8F197",
    accent5: "E7E3DA",
    accent6: "62655F",
    hlink: "3156BB",
    folHlink: "C6452C",
  };
  const repeat = (value: string) => value.repeat(3);
  add(
    "ppt/theme/theme1.xml",
    `${XML}<a:theme ${A} name="Slide Atlas"><a:themeElements><a:clrScheme name="Atlas">${Object.entries(
      colors,
    )
      .map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`)
      .join(
        "",
      )}</a:clrScheme><a:fontScheme name="Atlas"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Atlas"><a:fillStyleLst>${repeat('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:fillStyleLst><a:lnStyleLst>${repeat('<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>')}</a:lnStyleLst><a:effectStyleLst>${repeat("<a:effectStyle><a:effectLst/></a:effectStyle>")}</a:effectStyleLst><a:bgFillStyleLst>${repeat('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
  );
  deck.slides.forEach((slide, index) => {
    const t = themeTokens[slide.theme],
      template = templates.find((t) => t.id === slide.templateId);
    if (!template) throw new Error("내보낼 템플릿이 없습니다.");
    const n = index + 1;
    let id = 2,
      content = "";
    if (template.layout === "hero")
      content +=
        shape(id++, 1270, 590, 340, 340, t.accent, "ellipse") +
        shape(id++, 1340, 660, 200, 200, t.bg, "ellipse");
    if (template.layout === "split")
      for (const x of [104, 850])
        content += shape(id++, x, 262, 646, 425, t.surface);
    if (template.layout === "metric-grid")
      for (const x of [568, 1073])
        content += shape(id++, x, 350, 2, 310, t.line);
    if (template.layout === "editorial")
      content += shape(id++, 953, 268, 2, 420, t.line);
    if (template.layout === "timeline") {
      content += shape(id++, 146, 440, 1030, 3, t.line);
      for (let i = 0; i < 3; i++)
        content += shape(id++, 136 + i * 488, 430, 24, 24, t.accent, "ellipse");
    }
    if (template.layout === "steps")
      for (let i = 0; i < 3; i++)
        content +=
          shape(id++, 124 + i * 488, 278, 68, 68, t.accent, "ellipse") +
          textBox(
            id++,
            "Step",
            `0${i + 1}`,
            139 + i * 488,
            290,
            60,
            40,
            24,
            t.accentText,
            true,
          );
    for (const slot of template.slots) {
      const fg =
        slot.role === "value" || slot.role === "label"
          ? t.accent
          : slot.role === "body" || slot.role === "caption"
            ? t.muted
            : t.text;
      content += textBox(
        id++,
        slot.key,
        slide.values[slot.key] ?? "",
        slot.x * 1600,
        slot.y * 900,
        slot.w * 1600,
        slot.h * 900,
        slot.fontSize,
        fg,
        ["title", "value", "step"].includes(slot.role),
      );
    }
    content +=
      shape(id++, 104, 809, 1392, 1, t.line) +
      textBox(
        id++,
        "Footer",
        "SLIDE ATLAS / IDEAS INTO STRUCTURE",
        104,
        824,
        1100,
        45,
        19,
        t.muted,
      ) +
      textBox(
        id++,
        "Page",
        String(n).padStart(2, "0"),
        1450,
        824,
        80,
        40,
        21,
        t.muted,
      );
    add(
      `ppt/slides/slide${n}.xml`,
      `${XML}<p:sld ${A} ${P} ${R}><p:cSld name="${escapeXml(slide.values.title ?? template.name)}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${rgb(t.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP}${content}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    add(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      rels([
        ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
        ["rId2", "notesSlide", `../notesSlides/notesSlide${n}.xml`],
      ]),
    );
    add(
      `ppt/notesSlides/notesSlide${n}.xml`,
      `${XML}<p:notes ${A} ${P} ${R}><p:cSld><p:spTree>${GROUP}${textBox(2, "Source and provenance", `Template: ${template.id}@${slide.templateVersion}\nProvider: ${deck.provider}\n원문 (수치와 주장을 검토하세요):\n${deck.brief}`, 50, 50, 800, 1000, 22, "#25382F", false, true)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,
    );
    add(
      `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
      rels([["rId1", "slide", `../slides/slide${n}.xml`]]),
    );
    overrides.push(
      [`/ppt/slides/slide${n}.xml`, "presentationml.slide"],
      [`/ppt/notesSlides/notesSlide${n}.xml`, "presentationml.notesSlide"],
    );
  });
  add(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([name, type]) => `<Override PartName="${name}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join("")}</Types>`,
  );
  return zipSync(files, { level: 6 });
}
