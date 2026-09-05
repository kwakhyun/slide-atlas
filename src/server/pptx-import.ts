import { strFromU8, unzipSync } from "fflate";
import {
  templateInputSchema,
  type Intent,
  type Layout,
  type PptxExtractionCandidate,
  type PptxExtractionResult,
  type Slot,
  type TemplateInput,
  type ThemeId,
} from "@/lib/domain";
import { AppError, invariant } from "@/server/errors";

export const PPTX_MAX_BYTES = 8 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 400;
const MAX_ANALYZED_SLIDES = 12;
const MIN_SLOT_SIZE = 0.012;

interface TextBlock {
  name: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

function fail(code: string, message: string): never {
  throw new AppError(422, code, message);
}

function assertZipBudget(data: Uint8Array) {
  invariant(
    data.byteLength >= 22,
    422,
    "INVALID_PPTX",
    "PowerPoint 파일 구조를 확인할 수 없습니다.",
  );
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (
    let offset = data.byteLength - 22;
    offset >= Math.max(0, data.byteLength - 65_557);
    offset--
  ) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0)
    fail("INVALID_PPTX", "PowerPoint ZIP 디렉터리를 확인할 수 없습니다.");
  const entries = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  invariant(
    entries > 0 && entries <= MAX_ENTRIES,
    422,
    "PPTX_COMPLEXITY_LIMIT",
    `파일 항목은 ${MAX_ENTRIES}개 이하여야 합니다.`,
  );
  let offset = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index++) {
    if (
      offset + 46 > data.byteLength ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      fail("INVALID_PPTX", "PowerPoint ZIP 항목이 손상되었습니다.");
    const flags = view.getUint16(offset + 8, true);
    invariant(
      (flags & 1) === 0,
      422,
      "ENCRYPTED_PPTX",
      "암호화된 PowerPoint 파일은 분석할 수 없습니다.",
    );
    total += view.getUint32(offset + 24, true);
    invariant(
      total <= MAX_UNCOMPRESSED_BYTES,
      422,
      "PPTX_EXPANSION_LIMIT",
      "압축을 푼 PowerPoint 파일이 분석 한도를 초과합니다.",
    );
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

function decodeXml(value: string) {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) =>
      String.fromCodePoint(
        code[0].toLowerCase() === "x"
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10),
      ),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(xml: string, element: string, name: string) {
  return xml.match(
    new RegExp(`<${element}\\b[^>]*\\b${name}="(\\d+)"`, "i"),
  )?.[1];
}

function textFromShape(shape: string) {
  return [...shape.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi)]
    .map((paragraph) =>
      [...paragraph[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
        .map((match) => decodeXml(match[1]))
        .join(""),
    )
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function parseTextBlocks(xml: string, width: number, height: number) {
  const blocks: TextBlock[] = [];
  const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/gi) ?? [];
  for (const shape of shapes) {
    const text = textFromShape(shape);
    if (!text) continue;
    const x = Number(attr(shape, "a:off", "x") ?? 0) / width;
    const y = Number(attr(shape, "a:off", "y") ?? 0) / height;
    const w = Number(attr(shape, "a:ext", "cx") ?? width * 0.5) / width;
    const h = Number(attr(shape, "a:ext", "cy") ?? height * 0.1) / height;
    const rawFont = Number(
      shape.match(/<(?:a:rPr|a:defRPr)\b[^>]*\bsz="(\d+)"/i)?.[1] ?? 1800,
    );
    const name = decodeXml(
      shape.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/i)?.[1] ?? "Text",
    );
    const normalizedX = clamp(x, 0, 0.98);
    const normalizedY = clamp(y, 0, 0.98);
    const normalizedW = clamp(w, MIN_SLOT_SIZE, 1 - normalizedX);
    const normalizedH = clamp(h, MIN_SLOT_SIZE, 1 - normalizedY);
    if (
      normalizedY > 0.86 &&
      (text.length <= 4 ||
        /slide atlas|confidential|copyright|page/i.test(text))
    )
      continue;
    blocks.push({
      name,
      text: text.slice(0, 500),
      x: normalizedX,
      y: normalizedY,
      w: normalizedW,
      h: normalizedH,
      fontSize: Math.round(clamp(rawFont / 60, 18, 160)),
    });
  }
  return blocks.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 12);
}

const numericPattern =
  /(?:\d[\d,.]*\s?(?:%|배|억|만|원|명|건|회|점)|^[+\-]?\d[\d,.]*$)/i;
const timelinePattern =
  /(?:\bq[1-4]\b|20\d{2}|\d{1,2}월|상반기|하반기|분기|주차)/i;

function inferLayout(blocks: TextBlock[]) {
  const signals: string[] = [`텍스트 블록 ${blocks.length}개`];
  const numeric = blocks.filter((block) => numericPattern.test(block.text));
  const timed = blocks.filter((block) => timelinePattern.test(block.text));
  const lower = blocks.filter((block) => block.y > 0.26);
  const left = lower.filter((block) => block.x + block.w / 2 < 0.48);
  const right = lower.filter((block) => block.x + block.w / 2 > 0.52);
  const stepMarkers = blocks.filter(
    (block) =>
      /^step(?:\s|$)/i.test(block.name) || /^0?[1-9]\d?$/.test(block.text),
  );
  const columns = [...new Set(lower.map((block) => Math.round(block.x * 10)))];
  const pairs = columns
    .map((column) =>
      lower
        .filter((block) => Math.round(block.x * 10) === column)
        .sort((a, b) => a.y - b.y),
    )
    .filter((column) => column.length >= 2);
  let layout: Layout;
  if (stepMarkers.length >= 3) {
    layout = "steps";
    signals.push(`단계 표식 ${stepMarkers.length}개`);
  } else if (numeric.length >= 2) {
    layout = "metric-grid";
    signals.push(`숫자형 값 ${numeric.length}개`);
  } else if (timed.length >= 2) {
    layout = "timeline";
    signals.push(`시점 표현 ${timed.length}개`);
  } else if (
    pairs.length >= 3 &&
    pairs.every((column) => column[0].fontSize < column.at(-1)!.fontSize)
  ) {
    layout = "timeline";
    signals.push("시점·마일스톤 반복 구조");
  } else if (lower.length >= 4 && columns.length >= 3) {
    layout = "steps";
    signals.push("가로 반복 구조");
  } else if (blocks.length <= 3 && left.length >= 1 && right.length >= 1) {
    layout = "editorial";
    signals.push("비대칭 제목·본문 구조");
  } else if (left.length >= 1 && right.length >= 1) {
    layout = "split";
    signals.push("좌우 분할 구조");
  } else if (blocks.length <= 3) {
    layout = "hero";
    signals.push("단일 메시지 구조");
  } else {
    layout = "editorial";
    signals.push("제목·본문 서사 구조");
  }
  return { layout, signals };
}

function roleFor(
  block: TextBlock,
  index: number,
  blocks: TextBlock[],
  layout: Layout,
): Slot["role"] {
  const largest = Math.max(...blocks.map((item) => item.fontSize));
  if (index === 0 || (block.fontSize >= largest * 0.88 && block.y < 0.4))
    return "title";
  if (numericPattern.test(block.text)) return "value";
  if (layout === "timeline") return block.y < 0.5 ? "label" : "step";
  if (layout === "steps" && block.text.length <= 32) return "step";
  if (block.text.length <= 28 || block.fontSize <= 24) return "label";
  return "body";
}

function slotsFromBlocks(blocks: TextBlock[], layout: Layout) {
  const counts = new Map<string, number>();
  const slots: Slot[] = [];
  const sampleContent: Record<string, string> = {};
  blocks.forEach((block, index) => {
    const role = roleFor(block, index, blocks, layout);
    const count = (counts.get(role) ?? 0) + 1;
    counts.set(role, count);
    const key = role === "title" && count === 1 ? "title" : `${role}_${count}`;
    const maxChars = Math.round(
      clamp(
        Math.max(block.text.length * 1.35, role === "title" ? 36 : 24),
        4,
        500,
      ),
    );
    slots.push({
      key,
      label:
        role === "title"
          ? "핵심 제목"
          : `${{ value: "핵심 값", label: "레이블", step: "단계", body: "본문", subtitle: "부제", caption: "설명" }[role]} ${count}`,
      role,
      required: role === "title" || block.text.length > 0,
      maxChars,
      x: Number(block.x.toFixed(4)),
      y: Number(block.y.toFixed(4)),
      w: Number(block.w.toFixed(4)),
      h: Number(block.h.toFixed(4)),
      fontSize: block.fontSize,
    });
    sampleContent[key] = block.text.slice(0, maxChars);
  });
  if (!slots.some((slot) => slot.role === "title")) slots[0].role = "title";
  if (slots.length === 1) {
    slots.push({
      key: "body_1",
      label: "본문 1",
      role: "body",
      required: false,
      maxChars: 120,
      x: 0.08,
      y: 0.64,
      w: 0.84,
      h: 0.2,
      fontSize: 28,
    });
    sampleContent.body_1 = "";
  }
  return { slots, sampleContent };
}

function intentFor(layout: Layout): Intent {
  return {
    hero: "overview",
    split: "comparison",
    "metric-grid": "metrics",
    steps: "process",
    timeline: "timeline",
    editorial: "insight",
  }[layout] as Intent;
}

function themeFromXml(xml: string): ThemeId {
  const value = xml.match(
    /<p:bg>[\s\S]*?<a:srgbClr\b[^>]*\bval="([0-9a-f]{6})"/i,
  )?.[1];
  if (!value) return "paper";
  const rgb = [0, 2, 4].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16),
  );
  const brightness = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  if (brightness < 95) return "midnight";
  if (rgb[1] > rgb[0] * 1.08 && rgb[1] > rgb[2] * 1.03) return "forest";
  if (rgb[2] > rgb[0] * 1.05) return "paper";
  return "coral";
}

function buildCandidate(
  xml: string,
  slideNumber: number,
  fileStem: string,
  width: number,
  height: number,
): PptxExtractionCandidate | null {
  const blocks = parseTextBlocks(xml, width, height);
  if (!blocks.length) return null;
  const { layout, signals } = inferLayout(blocks);
  const { slots, sampleContent } = slotsFromBlocks(blocks, layout);
  const title = sampleContent.title?.replace(/\n/g, " ").trim();
  const warnings: string[] = [];
  const decorativeShapes =
    (xml.match(/<p:sp\b/gi) ?? []).length - blocks.length;
  if (/<p:grpSp\b/i.test(xml))
    warnings.push(
      "그룹 도형의 상위 변환은 적용하지 않았습니다. 원본 위치를 확인해 주세요.",
    );
  if (/<p:pic\b/i.test(xml))
    warnings.push("이미지는 초안에 포함하지 않았습니다.");
  if (/<p:graphicFrame\b/i.test(xml))
    warnings.push("표와 차트는 텍스트 슬롯으로 변환하지 않았습니다.");
  if (blocks.length >= 12)
    warnings.push("텍스트 블록을 중요도 순으로 12개까지 분석했습니다.");
  const confidence = Number(
    clamp(
      0.46 +
        Math.min(blocks.length, 6) * 0.055 +
        (signals.length > 1 ? 0.08 : 0),
      0,
      0.92,
    ).toFixed(2),
  );
  const template: TemplateInput = templateInputSchema.parse({
    name: (title || `${fileStem} ${slideNumber}번 슬라이드`).slice(0, 80),
    description: `${slideNumber}번 슬라이드의 텍스트 ${blocks.length}개와 배치 좌표를 분석해 만든 온톨로지 초안입니다.`,
    intent: intentFor(layout),
    layout,
    density:
      blocks.length <= 3 ? "low" : blocks.length >= 8 ? "high" : "medium",
    tags: ["PPTX 추출", `슬라이드 ${slideNumber}`, intentFor(layout)],
    slots,
    defaultTheme: themeFromXml(xml),
    sampleContent,
  });
  return {
    slideNumber,
    confidence,
    signals,
    warnings,
    source: {
      blocks,
      textBlocks: blocks.length,
      decorativeShapes,
      originalWidth: width,
      originalHeight: height,
    },
    template,
  };
}

export function extractPptxTemplates(
  data: Uint8Array,
  fileName: string,
): PptxExtractionResult {
  invariant(
    data.byteLength > 0 && data.byteLength <= PPTX_MAX_BYTES,
    413,
    "PPTX_SIZE_LIMIT",
    "PowerPoint 파일은 8MB 이하여야 합니다.",
  );
  assertZipBudget(data);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    fail("INVALID_PPTX", "PowerPoint 파일의 압축 구조를 읽을 수 없습니다.");
  }
  const presentation = files["ppt/presentation.xml"];
  invariant(
    presentation,
    422,
    "INVALID_PPTX",
    "ppt/presentation.xml이 없는 파일입니다.",
  );
  const presentationXml = strFromU8(presentation);
  const width = Number(attr(presentationXml, "p:sldSz", "cx") ?? 12_192_000);
  const height = Number(attr(presentationXml, "p:sldSz", "cy") ?? 6_858_000);
  const slidePaths = Object.keys(files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  invariant(
    slidePaths.length > 0,
    422,
    "EMPTY_PPTX",
    "분석할 슬라이드가 없습니다.",
  );
  const stem = fileName.replace(/\.[^.]+$/, "").trim() || "가져온 슬라이드";
  const candidates = slidePaths
    .slice(0, MAX_ANALYZED_SLIDES)
    .map((path, index) =>
      buildCandidate(strFromU8(files[path]), index + 1, stem, width, height),
    )
    .filter((candidate): candidate is PptxExtractionCandidate => !!candidate);
  invariant(
    candidates.length > 0,
    422,
    "NO_TEXT_SLIDES",
    "텍스트와 배치 정보를 가진 슬라이드를 찾지 못했습니다.",
  );
  const warnings: string[] = [];
  if (slidePaths.length > MAX_ANALYZED_SLIDES)
    warnings.push(`앞쪽 ${MAX_ANALYZED_SLIDES}개 슬라이드만 분석했습니다.`);
  if (candidates.length < Math.min(slidePaths.length, MAX_ANALYZED_SLIDES))
    warnings.push("텍스트가 없는 슬라이드는 후보에서 제외했습니다.");
  return {
    fileName,
    slideCount: slidePaths.length,
    analyzedSlides: Math.min(slidePaths.length, MAX_ANALYZED_SLIDES),
    candidates,
    warnings,
  };
}
