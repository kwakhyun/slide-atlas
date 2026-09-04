"use client";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Grid2X2,
  Layers3,
  Loader2,
  Maximize2,
  MoreHorizontal,
  MousePointer2,
  Palette,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Trash2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { LoadingWorkspace, useWorkspace } from "./workspace";
import { SlideCanvas } from "./slide-canvas";
import { PageHeading } from "./ui";
import { StudioDialogs } from "./studio-dialogs";
import {
  QualityPanel,
  SlideFilmstrip,
  StudioHeaderActions,
  StudioOnboarding,
  StructureBar,
} from "./studio-chrome";
import { EXAMPLE_BRIEF } from "@/lib/catalog";
import {
  type WorkspaceState,
  themeTokens,
  THEMES,
  intentLabels,
  layoutLabels,
} from "@/lib/domain";
import { useStudioController } from "./studio/use-studio-controller";

export function Studio({ initialTemplateId }: { initialTemplateId?: string }) {
  const { state, refresh, notify } = useWorkspace();
  if (!state) return <LoadingWorkspace />;
  return (
    <StudioWorkspace
      state={state}
      refresh={refresh}
      notify={notify}
      initialTemplateId={initialTemplateId}
    />
  );
}

function StudioWorkspace({
  state,
  refresh,
  notify,
  initialTemplateId,
}: {
  state: WorkspaceState;
  refresh: () => Promise<WorkspaceState>;
  notify: (message: string, error?: boolean) => void;
  initialTemplateId?: string;
}) {
  const {
    accessCode,
    allThemes,
    approved,
    applyTheme,
    brief,
    busy,
    conflictOpen,
    count,
    deck,
    deckDialog,
    deckMenuOpen,
    deleteCurrentDeck,
    dirty,
    download,
    downloadRecoveryDraft,
    duplicateCurrentDeck,
    exportOpen,
    filmstripRef,
    future,
    generate,
    generationStep,
    guides,
    history,
    mobileView,
    moveSlide,
    onboardingOpen,
    present,
    provider,
    quality,
    qualityOpen,
    redo,
    removeSlide,
    renameCurrentDeck,
    renameTitle,
    save,
    selected,
    selectTemplate,
    setAccessCode,
    setAllThemes,
    setBrief,
    setConflictOpen,
    setCount,
    setDeckDialog,
    setDeckMenuOpen,
    setDraft,
    setExportOpen,
    setFuture,
    setGuides,
    setHistory,
    setIndex,
    setMobileView,
    setOnboardingOpen,
    setProvider,
    setQualityOpen,
    setRenameTitle,
    setSelectedId,
    setTab,
    slide,
    slideIndex,
    tab,
    template,
    undo,
    update,
    updateSlide,
  } = useStudioController({ state, refresh, notify, initialTemplateId });

  return (
    <div className="page studio-page">
      <PageHeading
        eyebrow="IDEAS INTO STRUCTURE"
        title="생각을 구조로, 구조를 디자인으로."
        description="이야기에 맞는 구조를 찾고, 나만의 슬라이드로 완성하세요."
        actions={
          <StudioHeaderActions
            busy={busy}
            exportOpen={exportOpen}
            onPresent={() => void present().catch(() => {})}
            onToggleExport={() => setExportOpen((open) => !open)}
            onDownload={(format) => void download(format)}
          />
        }
      />
      {onboardingOpen && (
        <StudioOnboarding
          onUseExample={() => {
            setBrief(EXAMPLE_BRIEF);
            setTab("brief");
            setMobileView("input");
            document.getElementById("brief")?.focus();
          }}
          onClose={() => {
            localStorage.setItem("slide-atlas-onboarding-v1", "done");
            setOnboardingOpen(false);
          }}
        />
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
                onClick={undo}
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
                onClick={() => void present().catch(() => {})}
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
            <QualityPanel
              quality={quality}
              onClose={() => setQualityOpen(false)}
            />
          )}
          <SlideFilmstrip
            deck={deck}
            templates={state.templates}
            slideIndex={slideIndex}
            filmstripRef={filmstripRef}
            onSelect={setIndex}
            onDuplicate={() => {
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
          />
        </section>
      </div>
      <StructureBar
        template={template}
        approved={approved}
        onChange={selectTemplate}
      />
      <div className="studio-disclaimer">
        <CircleHelp size={13} />
        <span>
          예시 브리프의 숫자는 가상 데이터입니다. 실제 고객 성과가 아닙니다.
          생성 후 내용과 넘침을 확인해 주세요.
        </span>
      </div>
      <StudioDialogs
        deck={deck}
        mode={deckDialog}
        renameTitle={renameTitle}
        busy={!!busy}
        conflictOpen={conflictOpen}
        onRenameTitle={setRenameTitle}
        onCloseMode={() => setDeckDialog(null)}
        onRename={() => void renameCurrentDeck()}
        onDelete={() => void deleteCurrentDeck()}
        onCloseConflict={() => setConflictOpen(false)}
        onDownloadRecovery={downloadRecoveryDraft}
        onReload={() => {
          void refresh().then(() => {
            setDraft(null);
            setHistory([]);
            setFuture([]);
            setConflictOpen(false);
            notify("서버의 최신 버전을 불러왔습니다.");
          });
        }}
      />
    </div>
  );
}
