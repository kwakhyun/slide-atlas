import { z } from "zod";

export const INTENTS = [
  "overview",
  "comparison",
  "metrics",
  "process",
  "timeline",
  "insight",
] as const;
export const LAYOUTS = [
  "hero",
  "split",
  "metric-grid",
  "steps",
  "timeline",
  "editorial",
] as const;
export const STATUSES = ["draft", "in_review", "approved", "rejected"] as const;
export const THEMES = ["coral", "midnight", "forest", "paper"] as const;
export type Intent = (typeof INTENTS)[number];
export type Layout = (typeof LAYOUTS)[number];
export type TemplateStatus = (typeof STATUSES)[number];
export type ThemeId = (typeof THEMES)[number];

export const intentLabels: Record<Intent, string> = {
  overview: "핵심 메시지",
  comparison: "비교·대조",
  metrics: "핵심 지표",
  process: "프로세스",
  timeline: "타임라인",
  insight: "인사이트",
};
export const layoutLabels: Record<Layout, string> = {
  hero: "히어로",
  split: "2단 비교",
  "metric-grid": "지표 그리드",
  steps: "단계 흐름",
  timeline: "시간 흐름",
  editorial: "에디토리얼",
};
export const statusLabels: Record<TemplateStatus, string> = {
  draft: "초안",
  in_review: "검수 대기",
  approved: "승인됨",
  rejected: "수정 요청",
};
export const themeTokens: Record<
  ThemeId,
  {
    name: string;
    bg: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    surface: string;
    line: string;
  }
> = {
  coral: {
    name: "Atlas Coral",
    bg: "#F4F0E9",
    text: "#252923",
    muted: "#62655F",
    accent: "#BC3E27",
    accentText: "#FFFFFF",
    surface: "#E7E3DA",
    line: "#C9C6BA",
  },
  midnight: {
    name: "Midnight Ink",
    bg: "#1D292A",
    text: "#F5F2E9",
    muted: "#B1BFBB",
    accent: "#D8F197",
    accentText: "#1D292A",
    surface: "#304041",
    line: "#536261",
  },
  forest: {
    name: "Sage Garden",
    bg: "#EAF0E4",
    text: "#263D30",
    muted: "#526650",
    accent: "#365E43",
    accentText: "#FFFFFF",
    surface: "#D8E3CE",
    line: "#B6C6AC",
  },
  paper: {
    name: "Editorial Blue",
    bg: "#EDF0F8",
    text: "#202F52",
    muted: "#54617B",
    accent: "#3156BB",
    accentText: "#FFFFFF",
    surface: "#DDE3F2",
    line: "#B7C2DE",
  },
};

export const slotSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
    label: z.string().min(1).max(60),
    role: z.enum([
      "title",
      "subtitle",
      "body",
      "label",
      "value",
      "caption",
      "step",
    ]),
    required: z.boolean(),
    maxChars: z.number().int().min(4).max(500),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().positive().max(1),
    h: z.number().positive().max(1),
    fontSize: z.number().int().min(18).max(160),
  })
  .refine(
    (s) => s.x + s.w <= 1.001 && s.y + s.h <= 1.001,
    "슬롯은 캔버스 내부에 있어야 합니다.",
  );
export type Slot = z.infer<typeof slotSchema>;

export const templateInputSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(5).max(400),
    intent: z.enum(INTENTS),
    layout: z.enum(LAYOUTS),
    density: z.enum(["low", "medium", "high"]),
    tags: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
    slots: z.array(slotSchema).min(2).max(12),
    defaultTheme: z.enum(THEMES),
    sampleContent: z.record(z.string(), z.string().max(500)),
  })
  .superRefine((t, ctx) => {
    if (new Set(t.slots.map((s) => s.key)).size !== t.slots.length)
      ctx.addIssue({
        code: "custom",
        message: "슬롯 키는 중복될 수 없습니다.",
        path: ["slots"],
      });
    if (!t.slots.some((s) => s.role === "title" && s.required))
      ctx.addIssue({
        code: "custom",
        message: "필수 제목 슬롯이 필요합니다.",
        path: ["slots"],
      });
    for (const s of t.slots) {
      if (s.required && !t.sampleContent[s.key]?.trim())
        ctx.addIssue({
          code: "custom",
          message: `${s.label} 예시가 필요합니다.`,
          path: ["sampleContent", s.key],
        });
      if ([...(t.sampleContent[s.key] ?? "")].length > s.maxChars)
        ctx.addIssue({
          code: "custom",
          message: `${s.label} 예시가 글자 제한을 초과했습니다.`,
          path: ["sampleContent", s.key],
        });
    }
    for (const key of Object.keys(t.sampleContent))
      if (!t.slots.some((s) => s.key === key))
        ctx.addIssue({
          code: "custom",
          message: "정의되지 않은 예시 슬롯입니다.",
          path: ["sampleContent", key],
        });
  });
export type TemplateInput = z.infer<typeof templateInputSchema>;
export interface SlideTemplate extends TemplateInput {
  id: string;
  version: number;
  status: TemplateStatus;
  updatedAt: string;
}

export const slideSchema = z.object({
  id: z.string().min(1).max(80),
  templateId: z.string().min(1).max(80),
  templateVersion: z.number().int().positive(),
  values: z.record(z.string().max(40), z.string().max(2000)),
  theme: z.enum(THEMES),
});
export type Slide = z.infer<typeof slideSchema>;
export interface Deck {
  id: string;
  title: string;
  brief: string;
  slides: Slide[];
  version: number;
  provider: "deterministic" | "openai";
  createdAt: string;
  updatedAt: string;
  generation?: {
    model: string;
    promptVersion: string;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
  };
}
export interface AuditEvent {
  id: string;
  entityType: "template" | "deck" | "experiment";
  entityId: string;
  action: string;
  detail: string;
  createdAt: string;
}
export interface QualityCheck {
  id: string;
  name: string;
  status: "pass" | "warning" | "error";
  message: string;
  slot?: string;
}
export interface QualityReport {
  score: number;
  checks: QualityCheck[];
  errors: number;
  warnings: number;
}
export interface SearchMatch {
  template: SlideTemplate;
  score: number;
  reasons: string[];
  breakdown: {
    lexical: number;
    intent: number;
    structure: number;
    capacity: number;
  };
}
export interface SearchQuery {
  q: string;
  intent?: Intent;
  layout?: Layout;
  status?: TemplateStatus;
  slots?: number;
  strategy?: "lexical" | "structure";
}
export interface EvalCase {
  id: string;
  query: string;
  intent: Intent;
  slots: number;
  relevantIds: string[];
}
export interface EvalResult {
  id: string;
  query: string;
  expected: string[];
  lexicalIds: string[];
  structureIds: string[];
  lexicalHit: boolean;
  structureHit: boolean;
  lexicalRR: number;
  structureRR: number;
}
export interface Experiment {
  id: string;
  name: string;
  createdAt: string;
  durationMs: number;
  datasetVersion: string;
  catalogVersion: string;
  size: number;
  lexical: { hitAt1: number; mrr: number };
  structure: { hitAt1: number; mrr: number };
  results: EvalResult[];
}
export interface WorkspaceState {
  templates: SlideTemplate[];
  decks: Deck[];
  events: AuditEvent[];
  experiments: Experiment[];
  storage: "postgres" | "embedded" | "ephemeral";
  aiAvailable: boolean;
}

export const generationInputSchema = z.object({
  brief: z
    .string()
    .trim()
    .min(20, "브리프를 20자 이상 입력해 주세요.")
    .max(6000),
  theme: z.enum(THEMES).default("coral"),
  count: z.number().int().min(1).max(6).default(4),
  provider: z.enum(["deterministic", "openai"]).default("deterministic"),
});
