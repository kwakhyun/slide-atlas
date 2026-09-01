"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Copy,
  FileText,
  Grid2X2,
  Layers3,
  Loader2,
  Maximize2,
  MoreHorizontal,
  MousePointer2,
  Palette,
  Play,
  Plus,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import { ApiError, api, LoadingWorkspace, useWorkspace } from "./workspace";
import { SlideCanvas } from "./slide-canvas";
import { Modal, PageHeading } from "./ui";
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

export function Studio({ initialTemplateId }: { initialTemplateId?: string }) {
  const { state, refresh, notify } = useWorkspace();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [history, setHistory] = useState<Deck[]>([]);
  const [future, setFuture] = useState<Deck[]>([]);
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
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);
  const [deckDialog, setDeckDialog] = useState<"rename" | "delete" | null>(
    null,
  );
  const [renameTitle, setRenameTitle] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"preview" | "input">("preview");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const appliedTemplate = useRef<string | null>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (localStorage.getItem("slide-atlas-onboarding-v1") !== "done")
        setOnboardingOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (busy !== "generate") return;
    const first = window.setTimeout(() => setGenerationStep(1), 450);
    const second = window.setTimeout(() => setGenerationStep(2), 1300);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [busy]);
  useEffect(() => {
    const active = filmstripRef.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [index]);
  useEffect(() => {
    if (
      !state ||
      !initialTemplateId ||
      appliedTemplate.current === initialTemplateId
    )
      return;
    const target = state.templates.find(
      (item) => item.id === initialTemplateId && item.status === "approved",
    );
    const base = state.decks[0];
    if (!target || !base) {
      notify("선택한 승인 템플릿을 찾을 수 없습니다.", true);
      return;
    }
    const current = base.slides[0];
    const frame = window.requestAnimationFrame(() => {
      appliedTemplate.current = initialTemplateId;
      setSelectedId(base.id);
      setDraft({
        ...base,
        slides: base.slides.map((item, itemIndex) =>
          itemIndex === 0
            ? {
                ...current,
                templateId: target.id,
                templateVersion: target.version,
                values: mapSourceToTemplate(base.brief, target),
              }
            : item,
        ),
      });
      setHistory([base]);
      setFuture([]);
      setIndex(0);
      setTab("content");
      notify(`“${target.name}” 템플릿을 첫 슬라이드에 적용했습니다.`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTemplateId, notify, state]);
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
    setFuture([]);
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
      setFuture([]);
      notify("내용과 스타일을 저장했습니다.");
      return saved;
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT")
        setConflictOpen(true);
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
    setGenerationStep(0);
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
      setFuture([]);
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
  function moveSlide(direction: -1 | 1) {
    const target = slideIndex + direction;
    if (target < 0 || target >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[slideIndex], slides[target]] = [slides[target], slides[slideIndex]];
    update({ ...deck, slides });
    setIndex(target);
  }
  function removeSlide() {
    if (deck.slides.length <= 1) return;
    update({
      ...deck,
      slides: deck.slides.filter((_, itemIndex) => itemIndex !== slideIndex),
    });
    setIndex(Math.max(0, slideIndex - 1));
  }
  function redo() {
    const next = future.at(-1);
    if (!next) return;
    setHistory((items) => [...items.slice(-19), deck]);
    setDraft(next);
    setFuture((items) => items.slice(0, -1));
  }
  async function duplicateCurrentDeck() {
    setDeckMenuOpen(false);
    setBusy("duplicate");
    try {
      const copy = await api<Deck>(`/decks/${deck.id}/duplicate`, {
        method: "POST",
      });
      await refresh();
      setSelectedId(copy.id);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setIndex(0);
      notify("프레젠테이션 복사본을 만들었습니다.");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function renameCurrentDeck() {
    const title = renameTitle.trim();
    if (!title) return;
    setBusy("rename");
    try {
      const saved = await api<Deck>(`/decks/${deck.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          slides: deck.slides,
          expectedVersion: deck.version,
        }),
      });
      await refresh();
      setSelectedId(saved.id);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setDeckDialog(null);
      notify("프레젠테이션 이름을 변경했습니다.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT")
        setConflictOpen(true);
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  async function deleteCurrentDeck() {
    setBusy("delete");
    try {
      await api(`/decks/${deck.id}`, { method: "DELETE" });
      const next = await refresh();
      setSelectedId(next.decks[0]?.id ?? null);
      setDraft(null);
      setHistory([]);
      setFuture([]);
      setIndex(0);
      setDeckDialog(null);
      notify("프레젠테이션을 삭제했습니다.");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(null);
    }
  }
  function downloadRecoveryDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(deck, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `slide-atlas-recovery-${deck.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      {onboardingOpen && (
        <section className="onboarding-card" aria-label="3분 데모 안내">
          <div>
            <span className="mini-label">처음 오셨나요?</span>
            <h2>세 단계로 핵심 흐름을 확인해 보세요.</h2>
            <p>
              예시 생성부터 구조 교체와 검색 실험까지 약 3분이면 충분합니다.
            </p>
          </div>
          <ol>
            <li>
              <strong>1</strong>
              <button
                onClick={() => {
                  setBrief(EXAMPLE_BRIEF);
                  setTab("brief");
                  setMobileView("input");
                  document.getElementById("brief")?.focus();
                }}
              >
                예시로 생성하기
              </button>
            </li>
            <li>
              <strong>2</strong>
              <Link href="/library">승인 템플릿 고르기</Link>
            </li>
            <li>
              <strong>3</strong>
              <Link href="/experiments">검색 실험 확인하기</Link>
            </li>
          </ol>
          <button
            className="icon-btn onboarding-close"
            aria-label="3분 데모 안내 닫기"
            onClick={() => {
              localStorage.setItem("slide-atlas-onboarding-v1", "done");
              setOnboardingOpen(false);
            }}
          >
            <X size={16} />
          </button>
        </section>
      )}
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
              setFuture([]);
            }}
          >
            {state.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <span className="soft-tag">슬라이드 {deck.slides.length}장</span>
        </div>
        <div className="project-save">
          <span className={dirty ? "unsaved" : "saved"}>
            {dirty ? <span className="tiny-dot" /> : <Check size={13} />}
            {dirty
              ? "저장하지 않은 변경사항"
              : `마지막 저장 ${new Date(deck.updatedAt).toLocaleTimeString(
                  "ko-KR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  },
                )}`}
          </span>
          <button
            className="btn small save-action"
            title="변경사항 저장"
            aria-label="변경사항 저장"
            disabled={!dirty || !!busy}
            onClick={() => void save().catch(() => {})}
          >
            <Save size={16} />
            {busy === "save" ? "저장 중" : "저장"}
          </button>
          <div className="deck-menu-wrap">
            <button
              className="icon-btn"
              aria-label="프레젠테이션 관리"
              aria-expanded={deckMenuOpen}
              onClick={() => setDeckMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={17} />
            </button>
            {deckMenuOpen && (
              <div className="deck-menu">
                <button
                  onClick={() => {
                    setRenameTitle(deck.title);
                    setDeckDialog("rename");
                    setDeckMenuOpen(false);
                  }}
                >
                  이름 변경
                </button>
                <button
                  disabled={dirty || !!busy}
                  onClick={() => void duplicateCurrentDeck()}
                >
                  복제
                </button>
                <button
                  className="danger-text"
                  disabled={dirty || state.decks.length <= 1 || !!busy}
                  onClick={() => {
                    setDeckDialog("delete");
                    setDeckMenuOpen(false);
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {deck.generation && (
        <details className="ai-evidence">
          <summary>
            AI 생성 근거
            <span>
              {deck.generation.model} ·{" "}
              {deck.generation.durationMs.toLocaleString()}ms
            </span>
          </summary>
          <div>
            <span>프롬프트 {deck.generation.promptVersion}</span>
            <span>
              토큰 {deck.generation.inputTokens.toLocaleString()} 입력 ·{" "}
              {deck.generation.outputTokens.toLocaleString()} 출력
            </span>
            {state.aiUsage && (
              <span>
                오늘 남은 요청 {state.aiUsage.remaining}/{state.aiUsage.limit}
              </span>
            )}
          </div>
        </details>
      )}
      <div
        className="mobile-studio-switcher"
        role="group"
        aria-label="모바일 편집 화면"
      >
        <button
          className={mobileView === "preview" ? "active" : ""}
          aria-pressed={mobileView === "preview"}
          onClick={() => setMobileView("preview")}
        >
          미리보기
        </button>
        <button
          className={mobileView === "input" ? "active" : ""}
          aria-pressed={mobileView === "input"}
          onClick={() => setMobileView("input")}
        >
          내용 입력
        </button>
      </div>
      <div className={`studio-grid mobile-${mobileView}`}>
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
                    {state.aiUsage && (
                      <>
                        <br />
                        오늘 남은 요청은 {state.aiUsage.remaining}/
                        {state.aiUsage.limit}회입니다.
                      </>
                    )}
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
              <p className="content-save-note">
                변경 내용은 미리보기에 즉시 반영됩니다. 저장은 상단 버튼에서 한
                번만 진행합니다.
              </p>
            </div>
          )}
        </section>
        <section className="stage-panel" aria-label="슬라이드 미리보기">
          <div className="stage-toolbar">
            <div className="stage-title">
              <span className="live-dot" />
              실시간 미리보기<span className="stage-ratio">16:9</span>
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
                  const previous = history.at(-1);
                  if (!previous) return;
                  setFuture((items) => [...items.slice(-19), deck]);
                  setDraft(previous);
                  setHistory((items) => items.slice(0, -1));
                }}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-btn"
                title="다시 실행"
                aria-label="다시 실행"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <button
                className="icon-btn"
                title="슬라이드를 앞으로 이동"
                aria-label="슬라이드를 앞으로 이동"
                disabled={slideIndex === 0}
                onClick={() => moveSlide(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-btn"
                title="슬라이드를 뒤로 이동"
                aria-label="슬라이드를 뒤로 이동"
                disabled={slideIndex === deck.slides.length - 1}
                onClick={() => moveSlide(1)}
              >
                <ChevronRight size={17} />
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
                className="icon-btn danger-icon"
                title="슬라이드 삭제"
                aria-label="슬라이드 삭제"
                disabled={deck.slides.length <= 1}
                onClick={removeSlide}
              >
                <Trash2 size={16} />
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
          {busy === "generate" && (
            <div
              className="generation-progress"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="spin" size={17} />
              <div>
                <strong>
                  {generationStep === 0
                    ? "승인 구조를 찾고 있습니다."
                    : generationStep === 1
                      ? "내용을 슬롯에 배치하고 있습니다."
                      : "자동 품질 검사를 진행하고 있습니다."}
                </strong>
                <span>구조 검색 → 슬롯 배치 → 품질 검사</span>
              </div>
            </div>
          )}
          <div
            className={`slide-mat ${busy === "generate" ? "is-generating" : ""}`}
          >
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
                자동 검사{" "}
                {quality.checks.filter((item) => item.status === "pass").length}
                /{quality.checks.length}
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
                <span>규칙 기반 자동 검사</span>
                <strong>
                  통과{" "}
                  {
                    quality.checks.filter((item) => item.status === "pass")
                      .length
                  }{" "}
                  · 오류 {quality.errors} · 경고 {quality.warnings}
                </strong>
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
          <div className="filmstrip" ref={filmstripRef}>
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
          <span className="mini-label">구조 정보</span>
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
      {deckDialog === "rename" && (
        <Modal
          title="프레젠테이션 이름 변경"
          subtitle="목록과 발표 화면에 표시할 이름을 입력해 주세요."
          onClose={() => setDeckDialog(null)}
        >
          <form
            className="modal-body compact-form"
            onSubmit={(event) => {
              event.preventDefault();
              void renameCurrentDeck();
            }}
          >
            <label className="field-label" htmlFor="deck-title">
              프레젠테이션 이름
            </label>
            <input
              id="deck-title"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              minLength={1}
              maxLength={80}
              autoFocus
              required
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setDeckDialog(null)}
              >
                취소
              </button>
              <button
                className="btn dark"
                disabled={!!busy || !renameTitle.trim()}
              >
                이름 저장
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deckDialog === "delete" && (
        <Modal
          title="프레젠테이션 삭제"
          subtitle="이 작업은 되돌릴 수 없습니다."
          onClose={() => setDeckDialog(null)}
        >
          <div className="modal-body confirm-copy">
            <p>
              “{deck.title}”과 포함된 슬라이드 {deck.slides.length}장을
              삭제합니다.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDeckDialog(null)}>
                취소
              </button>
              <button
                className="btn danger"
                disabled={!!busy}
                onClick={() => void deleteCurrentDeck()}
              >
                삭제하기
              </button>
            </div>
          </div>
        </Modal>
      )}
      {conflictOpen && (
        <Modal
          title="새 버전이 저장되어 있습니다"
          subtitle="현재 편집 내용은 유지하고 있습니다. 먼저 안전하게 보관해 주세요."
          onClose={() => setConflictOpen(false)}
        >
          <div className="modal-body confirm-copy">
            <p>
              다른 작업에서 같은 프레젠테이션을 먼저 저장했습니다. 내 변경을
              JSON으로 내려받거나 서버의 최신 버전을 불러올 수 있습니다.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={downloadRecoveryDraft}>
                내 변경 JSON 내려받기
              </button>
              <button
                className="btn dark"
                onClick={() => {
                  void refresh().then(() => {
                    setDraft(null);
                    setHistory([]);
                    setFuture([]);
                    setConflictOpen(false);
                    notify("서버의 최신 버전을 불러왔습니다.");
                  });
                }}
              >
                최신 버전 불러오기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
