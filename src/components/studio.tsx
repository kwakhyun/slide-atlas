"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  Copy,
  FileText,
  Grid2X2,
  Layers3,
  Loader2,
  Maximize2,
  MousePointer2,
  Palette,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import { api, LoadingWorkspace, useWorkspace } from "./workspace";
import { SlideCanvas } from "./slide-canvas";
import { PageHeading } from "./ui";
import { EXAMPLE_BRIEF } from "@/lib/catalog";
import {
  type Deck,
  type Slide,
  type ThemeId,
  themeTokens,
  THEMES,
  intentLabels,
  layoutLabels,
} from "@/lib/domain";
import { checkSlide } from "@/lib/quality";
import { mapSourceToTemplate } from "@/lib/generate";
import { useUnsavedWarning } from "./use-unsaved-warning";

export function Studio() {
  const { state, refresh, notify } = useWorkspace();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [history, setHistory] = useState<Deck[]>([]);
  const [index, setIndex] = useState(0);
  const [brief, setBrief] = useState(EXAMPLE_BRIEF);
  const [theme, setTheme] = useState<ThemeId>("coral");
  const [count, setCount] = useState(4);
  const [provider, setProvider] = useState<"deterministic" | "openai">(
    "deterministic",
  );
  const [accessCode, setAccessCode] = useState("");
  const [tab, setTab] = useState<"brief" | "content">("brief");
  const [busy, setBusy] = useState<string | null>(null);
  const [guides, setGuides] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [allThemes, setAllThemes] = useState(false);
  useUnsavedWarning(!!draft);
  if (!state) return <LoadingWorkspace />;
  const selected =
    state.decks.find((d) => d.id === selectedId) ?? state.decks[0];
  const deck = draft?.id === selected?.id ? draft : selected;
  if (!deck) return <LoadingWorkspace />;
  const slideIndex = Math.min(index, deck.slides.length - 1);
  const slide = deck.slides[slideIndex];
  const template = state.templates.find((t) => t.id === slide.templateId)!;
  const quality = checkSlide(slide, template, deck.brief);
  const dirty = draft?.id === selected.id;
  const approved = state.templates.filter((t) => t.status === "approved");

  function update(next: Deck) {
    setHistory((h) => [...h.slice(-19), deck]);
    setDraft(next);
  }
  function updateSlide(patch: Partial<Slide>) {
    update({
      ...deck,
      slides: deck.slides.map((s, i) =>
        i === slideIndex ? { ...s, ...patch } : s,
      ),
    });
  }
  function applyTheme(value: ThemeId) {
    setTheme(value);
    update({
      ...deck,
      slides: deck.slides.map((s, i) =>
        allThemes || i === slideIndex ? { ...s, theme: value } : s,
      ),
    });
  }
  async function save(): Promise<Deck> {
    if (!dirty) return deck;
    setBusy("save");
    try {
      const saved = await api<Deck>(`/decks/${deck.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: deck.title,
          slides: deck.slides,
          expectedVersion: deck.version,
        }),
      });
      await refresh();
      setDraft(null);
      setHistory([]);
      notify("내용과 스타일을 저장했습니다.");
      return saved;
    } catch (error) {
      notify((error as Error).message, true);
      throw error;
    } finally {
      setBusy(null);
    }
  }
  async function generate() {
    if (dirty) {
      notify("편집 중인 슬라이드를 먼저 저장해 주세요.", true);
      return;
    }
    setBusy("generate");
    try {
      const result = await api<Deck>("/decks", {
        method: "POST",
        body: JSON.stringify({ brief, theme, count, provider }),
        headers:
          provider === "openai" ? { "X-AI-Access-Code": accessCode } : {},
      });
      await refresh();
      setSelectedId(result.id);
      setDraft(null);
      setIndex(0);
      setHistory([]);
      notify(
        `${result.slides.length}장의 슬라이드를 만들었습니다. 품질 검사를 확인해 주세요.`,
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function download(format: "pptx" | "svg" | "json") {
    setExportOpen(false);
    try {
      await save();
      setBusy("export");
      const response = await fetch(
        `/api/decks/${deck.id}/export?format=${format}&slide=${slideIndex}`,
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message ?? "내보내기에 실패했습니다.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `slide-atlas${format === "svg" ? `-${slideIndex + 1}` : ""}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${format.toUpperCase()} 파일을 내보냈습니다.`);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page studio-page">
      <PageHeading
        eyebrow="IDEAS INTO STRUCTURE"
        title="생각을 구조로, 구조를 디자인으로."
        description="이야기에 맞는 구조를 찾고, 나만의 슬라이드로 완성하세요."
        actions={
          <>
            <button
              className="btn"
              disabled={!!busy}
              onClick={async () => {
                try {
                  await save();
                  router.push(`/present/${deck.id}`);
                } catch {}
              }}
            >
              <Play size={15} />
              발표하기
            </button>
            <div className="export-wrap">
              <button
                className="btn dark"
                disabled={!!busy}
                aria-expanded={exportOpen}
                onClick={() => setExportOpen(!exportOpen)}
              >
                {busy === "export" ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ArrowDownToLine size={16} />
                )}
                내보내기
                <ChevronDown size={14} />
              </button>
              {exportOpen && (
                <div className="export-menu">
                  <button onClick={() => void download("pptx")}>
                    <FileText size={16} />
                    <span>
                      PowerPoint<small>편집 가능한 텍스트 · .pptx</small>
                    </span>
                  </button>
                  <button onClick={() => void download("svg")}>
                    <Layers3 size={16} />
                    <span>
                      현재 슬라이드 SVG<small>벡터 이미지 · .svg</small>
                    </span>
                  </button>
                  <button onClick={() => void download("json")}>
                    <Grid2X2 size={16} />
                    <span>
                      구조 데이터<small>원문·슬롯·템플릿 · .json</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />
      <div className="project-strip">
        <div>
          <span className="project-icon">
            <Layers3 size={17} />
          </span>
          <label className="sr-only" htmlFor="deck-select">
            프레젠테이션 선택
          </label>
          <select
            id="deck-select"
            value={selected.id}
            disabled={dirty || !!busy}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setIndex(0);
              setDraft(null);
              setHistory([]);
            }}
          >
            {state.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <span className="soft-tag">{deck.slides.length} SLIDES</span>
        </div>
        <div className="project-save">
          <span className={dirty ? "unsaved" : "saved"}>
            {dirty ? <span className="tiny-dot" /> : <Check size={13} />}
            {dirty ? "저장하지 않은 변경사항" : "모든 변경사항 저장됨"}
          </span>
          <button
            className="icon-btn"
            title="변경사항 저장"
            aria-label="변경사항 저장"
            disabled={!dirty || !!busy}
            onClick={() => void save().catch(() => {})}
          >
            <Save size={16} />
          </button>
        </div>
      </div>
      <div className="studio-grid">
        <section className="input-panel" aria-label="브리프와 내용 편집">
          <div className="panel-tabs" role="tablist" aria-label="입력 방식">
            <button
              id="brief-tab"
              role="tab"
              aria-selected={tab === "brief"}
              aria-controls="brief-panel"
              className={tab === "brief" ? "active" : ""}
              onClick={() => setTab("brief")}
            >
              <WandSparkles size={16} />
              브리프 작성
            </button>
            <button
              id="content-tab"
              role="tab"
              aria-selected={tab === "content"}
              aria-controls="content-panel"
              className={tab === "content" ? "active" : ""}
              onClick={() => setTab("content")}
            >
              <MousePointer2 size={16} />
              내용 편집
            </button>
          </div>
          {tab === "brief" ? (
            <div
              id="brief-panel"
              role="tabpanel"
              aria-labelledby="brief-tab"
              className="brief-panel"
            >
              <div className="panel-intro">
                <span className="mini-label">01 / YOUR STORY</span>
                <h2>어떤 이야기를 전할까요?</h2>
                <p>주제, 핵심 메시지, 필요한 숫자를 알려주세요.</p>
              </div>
              <div className="field-label">
                <label htmlFor="brief">프레젠테이션 브리프</label>
                <button
                  className="text-btn"
                  onClick={() => setBrief(EXAMPLE_BRIEF)}
                >
                  예시 불러오기 <ArrowRight size={12} />
                </button>
              </div>
              <textarea
                id="brief"
                className="brief-textarea"
                value={brief}
                maxLength={6000}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="전하고 싶은 이야기를 20자 이상 적어 주세요. 숫자와 근거도 함께 입력하면 좋아요."
              />
              <div className="textarea-meta">
                <span>
                  <ShieldCheck size={12} />
                  민감한 정보는 입력하지 마세요
                </span>
                <span>{brief.length.toLocaleString()} / 6,000</span>
              </div>
              <div className="input-row">
                <div>
                  <label className="field-label" htmlFor="slide-count">
                    슬라이드 수
                  </label>
                  <select
                    id="slide-count"
                    value={count}
                    onChange={(e) => setCount(+e.target.value)}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}장
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="provider">
                    생성 엔진
                  </label>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) =>
                      setProvider(e.target.value as typeof provider)
                    }
                  >
                    <option value="deterministic">규칙 기반 · 무료</option>
                    <option value="openai" disabled={!state.aiAvailable}>
                      OpenAI{!state.aiAvailable ? " · 연결 전" : " · 초대 코드"}
                    </option>
                  </select>
                </div>
              </div>
              {provider === "openai" && (
                <div>
                  <label className="field-label" htmlFor="ai-code">
                    AI 실험 초대 코드
                  </label>
                  <input
                    id="ai-code"
                    type="password"
                    autoComplete="off"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                  />
                  <p className="field-hint">
                    원문이 OpenAI에 전달되며 사용량 비용이 발생합니다.
                  </p>
                </div>
              )}
              <div className="generation-note">
                <Sparkles size={15} />
                <p>
                  승인된 템플릿에서 의도와 구조를 찾아
                  <br />
                  입력 내용을 슬롯에 배치합니다.
                </p>
              </div>
              <button
                className="btn primary generate-btn"
                disabled={!!busy || brief.trim().length < 20}
                onClick={() => void generate()}
              >
                {busy === "generate" ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {busy === "generate" ? "구조를 찾고 있어요…" : "슬라이드 생성"}
                <ArrowRight size={17} />
              </button>
              <p className="engine-disclosure">
                {provider === "deterministic"
                  ? "현재 모드는 LLM을 호출하지 않는 규칙 기반 데모입니다."
                  : "AI 결과는 규칙 검사 후에도 사람이 검토해야 합니다."}
              </p>
            </div>
          ) : (
            <div
              id="content-panel"
              role="tabpanel"
              aria-labelledby="content-tab"
              className="content-panel"
            >
              <div className="panel-intro">
                <span className="mini-label">02 / MAKE IT YOURS</span>
                <h2>메시지를 다듬어 보세요.</h2>
                <p>내용을 바꿔도 슬라이드의 구조는 유지됩니다.</p>
              </div>
              {template.slots.map((slot) => (
                <div className="slot-field" key={`${slide.id}-${slot.key}`}>
                  <label className="field-label" htmlFor={`slot-${slot.key}`}>
                    {slot.label}
                    {slot.required && <span className="required-dot">*</span>}
                    <span
                      className={
                        [...(slide.values[slot.key] ?? "")].length >
                        slot.maxChars
                          ? "over-budget"
                          : ""
                      }
                    >
                      {[...(slide.values[slot.key] ?? "")].length}/
                      {slot.maxChars}
                    </span>
                  </label>
                  <textarea
                    id={`slot-${slot.key}`}
                    rows={slot.role === "body" || slot.role === "title" ? 3 : 2}
                    value={slide.values[slot.key] ?? ""}
                    maxLength={2000}
                    onChange={(e) =>
                      updateSlide({
                        values: { ...slide.values, [slot.key]: e.target.value },
                      })
                    }
                  />
                  <span className="slot-key">
                    {slot.key} <span>· {slot.role}</span>
                  </span>
                </div>
              ))}
              <button
                className="btn primary full"
                disabled={!dirty || !!busy}
                onClick={() => void save().catch(() => {})}
              >
                <Save size={16} />
                변경사항 저장
              </button>
            </div>
          )}
        </section>
        <section className="stage-panel" aria-label="슬라이드 미리보기">
          <div className="stage-toolbar">
            <div className="stage-title">
              <span className="live-dot" />
              LIVE PREVIEW<span className="stage-ratio">16:9</span>
            </div>
            <div>
              <button
                className={`icon-btn ${guides ? "active" : ""}`}
                title="구조 가이드"
                aria-label="구조 가이드"
                aria-pressed={guides}
                onClick={() => setGuides(!guides)}
              >
                <Grid2X2 size={17} />
              </button>
              <button
                className="icon-btn"
                title="되돌리기"
                aria-label="되돌리기"
                disabled={!history.length}
                onClick={() => {
                  setDraft(history[history.length - 1]);
                  setHistory((h) => h.slice(0, -1));
                }}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-btn"
                title="슬라이드 복제"
                aria-label="슬라이드 복제"
                disabled={deck.slides.length >= 12}
                onClick={() => {
                  update({
                    ...deck,
                    slides: [
                      ...deck.slides,
                      {
                        ...slide,
                        id: crypto.randomUUID(),
                        values: { ...slide.values },
                      },
                    ],
                  });
                  setIndex(deck.slides.length);
                }}
              >
                <Copy size={16} />
              </button>
              <button
                className="icon-btn"
                title="발표 화면"
                aria-label="발표 화면"
                onClick={async () => {
                  try {
                    await save();
                    router.push(`/present/${deck.id}`);
                  } catch {}
                }}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div className="slide-mat">
            <div className="slide-paper">
              <SlideCanvas
                slide={slide}
                template={template}
                showSlots={guides}
                slideNumber={slideIndex + 1}
              />
            </div>
            <div className="canvas-caption">
              <span>
                {intentLabels[template.intent]} <span>·</span>{" "}
                {layoutLabels[template.layout]}
              </span>
              <button
                className={`quality-pill ${quality.errors ? "has-error" : quality.warnings ? "has-warning" : ""}`}
                aria-expanded={qualityOpen}
                onClick={() => setQualityOpen(!qualityOpen)}
              >
                {quality.errors || quality.warnings ? (
                  <TriangleAlert size={13} />
                ) : (
                  <ShieldCheck size={13} />
                )}
                품질 {quality.score}
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
          <div className="style-bar">
            <div className="style-title">
              <Palette size={16} />
              <span>스타일</span>
            </div>
            <div className="theme-swatches">
              {THEMES.map((id) => (
                <button
                  key={id}
                  className={`theme-swatch ${slide.theme === id ? "selected" : ""}`}
                  style={{
                    background: themeTokens[id].bg,
                    color: themeTokens[id].accent,
                  }}
                  title={themeTokens[id].name}
                  aria-label={themeTokens[id].name}
                  aria-pressed={slide.theme === id}
                  onClick={() => applyTheme(id)}
                >
                  <span style={{ background: themeTokens[id].accent }} />
                  {slide.theme === id && <Check size={12} />}
                </button>
              ))}
            </div>
            <span className="theme-name">{themeTokens[slide.theme].name}</span>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={allThemes}
                onChange={(e) => setAllThemes(e.target.checked)}
              />
              전체 적용
            </label>
          </div>
          {qualityOpen && (
            <div className="quality-panel">
              <div className="section-label">
                <span>RULE-BASED QUALITY CHECK</span>
                <button
                  className="icon-btn"
                  aria-label="품질 검사 닫기"
                  onClick={() => setQualityOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
              {quality.checks.map((check) => (
                <div key={check.id} className={`quality-check ${check.status}`}>
                  {check.status === "pass" ? (
                    <CircleCheck size={15} />
                  ) : (
                    <TriangleAlert size={15} />
                  )}
                  <div>
                    <strong>{check.name}</strong>
                    <p>{check.message}</p>
                  </div>
                </div>
              ))}
              <p className="field-hint">
                규칙 기반 검사이며 디자인 완성도·사실성을 보증하지 않습니다.
              </p>
            </div>
          )}
          <div className="filmstrip">
            {deck.slides.map((item, i) => {
              const t = state.templates.find((t) => t.id === item.templateId)!;
              return (
                <button
                  key={item.id}
                  className={`film-item ${i === slideIndex ? "selected" : ""}`}
                  aria-label={`${i + 1}번 슬라이드 선택`}
                  aria-pressed={i === slideIndex}
                  onClick={() => setIndex(i)}
                >
                  <div className="film-image">
                    <SlideCanvas
                      slide={item}
                      template={t}
                      slideNumber={i + 1}
                    />
                    <span className="film-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="film-label">{intentLabels[t.intent]}</span>
                </button>
              );
            })}
            <button
              className="film-add"
              aria-label="슬라이드 복제하여 추가"
              disabled={deck.slides.length >= 12}
              onClick={() => {
                update({
                  ...deck,
                  slides: [
                    ...deck.slides,
                    {
                      ...slide,
                      id: crypto.randomUUID(),
                      values: { ...slide.values },
                    },
                  ],
                });
                setIndex(deck.slides.length);
              }}
            >
              <Plus size={22} />
              <span>추가</span>
            </button>
          </div>
        </section>
      </div>
      <div className="structure-bar">
        <div className="structure-icon">
          <Layers3 size={19} />
        </div>
        <div>
          <span className="mini-label">DESIGNED WITH STRUCTURE</span>
          <strong>
            {template.name} <span>v{template.version}</span>
          </strong>
          <p>
            의도: {intentLabels[template.intent]} <span>·</span> 슬롯{" "}
            {template.slots.length}개 <span>·</span> 승인된 구조로 시작합니다
          </p>
        </div>
        <div className="structure-select">
          <label htmlFor="template-select">템플릿 바꾸기</label>
          <select
            id="template-select"
            value={template.id}
            onChange={(e) => {
              const target = approved.find((t) => t.id === e.target.value);
              if (!target) return;
              updateSlide({
                templateId: target.id,
                templateVersion: target.version,
                values: mapSourceToTemplate(deck.brief, target),
              });
              notify("원문을 새 템플릿의 슬롯에 다시 배치했습니다.");
            }}
          >
            {!approved.some((t) => t.id === template.id) && (
              <option value={template.id}>{template.name} (재검수 필요)</option>
            )}
            {approved.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {intentLabels[t.intent]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="studio-disclaimer">
        <CircleHelp size={13} />
        <span>
          예시 브리프의 숫자는 가상 데이터입니다. 실제 고객 성과가 아닙니다.
          생성 후 내용과 넘침을 확인해 주세요.
        </span>
      </div>
    </div>
  );
}
