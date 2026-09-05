import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Grid2X2,
  Loader2,
  Maximize2,
  Palette,
  Redo2,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  Undo2,
} from "lucide-react";

import { THEMES, themeTokens, intentLabels, layoutLabels } from "@/lib/domain";
import type { useStudioController } from "./use-studio-controller";
import { SlideCanvas } from "../slide-canvas";
import { SlideFilmstrip, QualityPanel } from "../studio-chrome";
type Controller = ReturnType<typeof useStudioController>;

export function StudioStage({
  guides,
  setGuides,
  canUndo,
  canRedo,
  undo,
  redo,
  slideIndex,
  deck,
  moveSlide,
  duplicateSlide,
  removeSlide,
  present,
  busy,
  generationStep,
  slide,
  template,
  quality,
  qualityOpen,
  setQualityOpen,
  applyTheme,
  allThemes,
  setAllThemes,
  renderTemplates,
  filmstripRef,
  setIndex,
}: Pick<
  Controller,
  | "guides"
  | "setGuides"
  | "canUndo"
  | "canRedo"
  | "undo"
  | "redo"
  | "slideIndex"
  | "deck"
  | "moveSlide"
  | "duplicateSlide"
  | "removeSlide"
  | "present"
  | "busy"
  | "generationStep"
  | "slide"
  | "template"
  | "quality"
  | "qualityOpen"
  | "setQualityOpen"
  | "applyTheme"
  | "allThemes"
  | "setAllThemes"
  | "renderTemplates"
  | "filmstripRef"
  | "setIndex"
>) {
  return (
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
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-btn"
            title="다시 실행"
            aria-label="다시 실행"
            disabled={!canRedo}
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
            onClick={duplicateSlide}
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
        <div className="generation-progress" role="status" aria-live="polite">
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
            {quality.checks.filter((item) => item.status === "pass").length}/
            {quality.checks.length}
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
        <QualityPanel quality={quality} onClose={() => setQualityOpen(false)} />
      )}
      <SlideFilmstrip
        deck={deck}
        templates={renderTemplates}
        slideIndex={slideIndex}
        filmstripRef={filmstripRef}
        onSelect={setIndex}
        onDuplicate={duplicateSlide}
      />
    </section>
  );
}
