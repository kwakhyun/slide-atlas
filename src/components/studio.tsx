"use client";
import { CollaborationPanel } from "./studio/collaboration-panel";
import { BrandPanel } from "./studio/brand-panel";
import { RefinementPanel } from "./studio/refinement-panel";
import { StudioInputPanel } from "./studio/studio-input-panel";
import { StudioStage } from "./studio/studio-stage";

import { Check, CircleHelp, Layers3, MoreHorizontal, Save } from "lucide-react";
import { LoadingWorkspace, useWorkspace } from "./workspace";

import { PageHeading } from "./ui";
import { StudioDialogs } from "./studio-dialogs";
import {
  StudioHeaderActions,
  StudioOnboarding,
  StructureBar,
} from "./studio-chrome";
import { EXAMPLE_BRIEF } from "@/lib/catalog";
import { type WorkspaceState } from "@/lib/domain";
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
    localDraft,
    restoreDraft,
    selectedSlot,
    focusSlot,
    updateSlide,
    setBusy,
    accessCode,
    allThemes,
    approved,
    applyTheme,
    brief,
    busy,
    conflictOpen,
    count,
    completeOnboarding,
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
    canRedo,
    canUndo,
    endGroup,
    editValue,
    selectDeck,
    duplicateSlide,
    reloadDeck,
    generate,
    generationStep,
    guides,
    mobileView,
    needsReview,
    newerTemplate,
    moveSlide,
    onboardingOpen,
    present,
    provider,
    quality,
    qualityOpen,
    redo,
    renderTemplates,
    reviewSlide,
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
    setExportOpen,
    setGuides,
    setIndex,
    setMobileView,
    setOnboardingOpen,
    setProvider,
    setQualityOpen,
    setRenameTitle,
    setTab,
    slide,
    slideIndex,
    tab,
    template,
    undo,
  } = useStudioController({ state, refresh, notify, initialTemplateId });

  return (
    <div className="page studio-page">
      <PageHeading
        eyebrow="STUDIO"
        title="슬라이드 스튜디오"
        description="내용을 채우고 스타일을 골라 나만의 슬라이드를 완성하세요."
        actions={
          <>
            {!onboardingOpen && (
              <button
                className="text-btn"
                onClick={() => setOnboardingOpen(true)}
              >
                3분 체험 안내 열기
              </button>
            )}
            <StudioHeaderActions
              busy={busy}
              exportOpen={exportOpen}
              onPresent={() => void present().catch(() => {})}
              onToggleExport={() => setExportOpen((open) => !open)}
              onDownload={(format) => void download(format)}
            />
          </>
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
          onClose={completeOnboarding}
        />
      )}
      {busy === "readonly" && (
        <p className="field-hint">
          현재 권한은 열람 또는 검수입니다. 내용 편집은 작성자가 진행합니다.
        </p>
      )}
      {localDraft.recovery && (
        <section className="recovery-banner" aria-label="보관된 초안">
          <strong>이 브라우저에 저장하지 않은 초안이 있습니다.</strong>
          <p>
            초안: {localDraft.recovery.title} (v
            {localDraft.recovery.baseVersion}) / 서버: {selected.title} (v
            {selected.version})
          </p>
          {localDraft.recovery.baseVersion !== selected.version && (
            <p>
              서버 버전이 달라졌습니다. 복구 후 저장하면 충돌을 확인하며 서버
              내용을 덮어쓰지 않습니다.
            </p>
          )}
          <details>
            <summary>초안과 서버 내용 비교</summary>
            <pre>
              {JSON.stringify(
                {
                  초안: localDraft.recovery.slides.map((s) => s.values),
                  서버: selected.slides.map((s) => s.values),
                },
                null,
                2,
              )}
            </pre>
          </details>
          <button
            className="btn"
            disabled={!!busy || dirty}
            onClick={restoreDraft}
          >
            초안 복구
          </button>
          <button
            className="btn"
            disabled={!!busy}
            onClick={localDraft.dismiss}
          >
            보관된 초안 삭제
          </button>
          <button
            className="btn"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(localDraft.recovery, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "slide-atlas-local-draft.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            초안 JSON 보관
          </button>
        </section>
      )}
      {localDraft.status && (
        <p role="status" className="field-hint">
          {localDraft.status} · 서버 저장과 별도로 최대 7일간 복구할 수
          있습니다.
        </p>
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
            onChange={(e) => selectDeck(e.target.value)}
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
              disabled={!!busy}
              onClick={() => setDeckMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={17} />
            </button>
            {deckMenuOpen && (
              <div className="deck-menu">
                <button
                  disabled={!!busy}
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
      {tab === "content" && (
        <div
          className="deck-review-summary"
          role="region"
          aria-label="프레젠테이션 검토 현황"
        >
          <div>
            <strong>
              {needsReview.length
                ? `확인이 필요한 슬라이드 ${needsReview.length}장`
                : "모든 슬라이드가 자동 검사를 통과했습니다."}
            </strong>
            <span>
              내용을 다듬은 뒤 저장하세요. 수치의 맥락과 사실성은 직접 확인해
              주세요.
            </span>
          </div>
          <div>
            {needsReview.map((index) => (
              <button
                key={index}
                className="btn small"
                disabled={!!busy}
                onClick={() => reviewSlide(index)}
              >
                {index + 1}번 슬라이드 확인
              </button>
            ))}
          </div>
        </div>
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
      <fieldset
        className="studio-editing"
        disabled={!!busy || !!localDraft.recovery}
        aria-busy={!!busy && busy !== "readonly"}
        aria-label="슬라이드 편집 도구"
      >
        <div className={`studio-grid mobile-${mobileView}`}>
          <StudioInputPanel
            tab={tab}
            setTab={setTab}
            brief={brief}
            setBrief={setBrief}
            count={count}
            setCount={setCount}
            provider={provider}
            setProvider={setProvider}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
            busy={busy}
            generate={generate}
            template={template}
            slide={slide}
            editValue={editValue}
            endGroup={endGroup}
            state={state}
          />
          <StudioStage
            guides={guides}
            setGuides={setGuides}
            canUndo={canUndo}
            canRedo={canRedo}
            undo={undo}
            redo={redo}
            slideIndex={slideIndex}
            deck={deck}
            moveSlide={moveSlide}
            duplicateSlide={duplicateSlide}
            removeSlide={removeSlide}
            present={present}
            busy={busy}
            generationStep={generationStep}
            slide={slide}
            template={template}
            selectedSlot={selectedSlot}
            focusSlot={focusSlot}
            quality={quality}
            qualityOpen={qualityOpen}
            setQualityOpen={setQualityOpen}
            applyTheme={applyTheme}
            allThemes={allThemes}
            setAllThemes={setAllThemes}
            renderTemplates={renderTemplates}
            filmstripRef={filmstripRef}
            setIndex={setIndex}
          />
        </div>
        <StructureBar
          template={template}
          approved={approved}
          newerTemplate={newerTemplate}
          onChange={selectTemplate}
        />
      </fieldset>
      <div className="editor-utilities" aria-label="디자인 관리 도구">
        <CollaborationPanel key={deck.id} deck={deck} dirty={dirty} />
        <BrandPanel
          slide={slide}
          busy={!!busy}
          onApply={(brand) => updateSlide({ brand })}
        />
        <RefinementPanel
          key={`${deck.id}/${slide.id}/${template.id}@${template.version}`}
          deck={deck}
          slide={slide}
          template={template}
          dirty={dirty}
          busy={busy}
          provider={provider}
          accessCode={accessCode}
          setBusy={setBusy}
          updateSlide={updateSlide}
          notify={notify}
        />
      </div>
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
        onReload={() => void reloadDeck()}
      />
    </div>
  );
}
