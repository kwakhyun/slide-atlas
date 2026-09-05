"use client";

import type { RefObject } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ChevronDown,
  CircleCheck,
  FileText,
  Grid2X2,
  Layers3,
  Loader2,
  Play,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { SlideCanvas } from "./slide-canvas";
import {
  resolveSlideTemplate,
  templateVersionKey,
} from "@/lib/template-version";
import {
  intentLabels,
  type Deck,
  type QualityReport,
  type SlideTemplate,
} from "@/lib/domain";

export function StudioHeaderActions({
  busy,
  exportOpen,
  onPresent,
  onToggleExport,
  onDownload,
}: {
  busy: string | null;
  exportOpen: boolean;
  onPresent: () => void;
  onToggleExport: () => void;
  onDownload: (format: "pptx" | "svg" | "json") => void;
}) {
  return (
    <>
      <button className="btn" disabled={!!busy} onClick={onPresent}>
        <Play size={15} />
        발표하기
      </button>
      <div className="export-wrap">
        <button
          className="btn dark"
          disabled={!!busy}
          aria-expanded={exportOpen}
          onClick={onToggleExport}
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
            <button onClick={() => onDownload("pptx")}>
              <FileText size={16} />
              <span>
                PowerPoint<small>편집 가능한 텍스트 · .pptx</small>
              </span>
            </button>
            <button onClick={() => onDownload("svg")}>
              <Layers3 size={16} />
              <span>
                현재 슬라이드 SVG<small>벡터 이미지 · .svg</small>
              </span>
            </button>
            <button onClick={() => onDownload("json")}>
              <Grid2X2 size={16} />
              <span>
                구조 데이터<small>프레젠테이션·템플릿 · .json</small>
              </span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function StudioOnboarding({
  onUseExample,
  onClose,
}: {
  onUseExample: () => void;
  onClose: () => void;
}) {
  return (
    <section className="onboarding-card" aria-label="3분 체험 안내">
      <div>
        <h2>첫 디자인, 예시로 가볍게 시작하세요.</h2>
      </div>
      <ol>
        <li>
          <strong>1</strong>
          <button onClick={onUseExample}>예시로 시작하기</button>
        </li>
        <li>
          <strong>2</strong>
          <Link href="/library">승인 템플릿 살펴보기</Link>
        </li>
        <li>
          <strong>3</strong>
          <Link href="/experiments">검색 실험 확인하기</Link>
        </li>
      </ol>
      <button
        className="icon-btn onboarding-close"
        aria-label="3분 체험 안내 닫기"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </section>
  );
}

export function QualityPanel({
  quality,
  onClose,
  onFocusSlot,
}: {
  quality: QualityReport;
  onFocusSlot?: (slot: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="quality-panel">
      <div className="section-label">
        <span>규칙 기반 자동 검사</span>
        <strong>
          통과 {quality.checks.filter((item) => item.status === "pass").length}
          {" · "}오류 {quality.errors}
          {" · "}경고 {quality.warnings}
        </strong>
        <button
          className="icon-btn"
          aria-label="품질 검사 닫기"
          onClick={onClose}
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
            {check.status !== "pass" &&
              check.slots?.map((slot) => (
                <button
                  className="btn small"
                  key={slot}
                  onClick={() => onFocusSlot?.(slot)}
                >
                  {slot} 수정하기
                </button>
              ))}
          </div>
        </div>
      ))}
      <p className="field-hint">
        규칙 기반 검사이며 디자인 완성도나 사실성을 보증하지 않습니다.
      </p>
    </div>
  );
}

export function SlideFilmstrip({
  deck,
  templates,
  slideIndex,
  filmstripRef,
  onSelect,
  onDuplicate,
}: {
  deck: Deck;
  templates: SlideTemplate[];
  slideIndex: number;
  filmstripRef: RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="filmstrip" ref={filmstripRef}>
      {deck.slides.map((slide, index) => {
        const template = resolveSlideTemplate(slide, templates);
        return (
          <button
            key={slide.id}
            className={`film-item ${index === slideIndex ? "selected" : ""}`}
            aria-label={`${index + 1}번 슬라이드 선택`}
            aria-pressed={index === slideIndex}
            onClick={() => onSelect(index)}
          >
            <div className="film-image">
              <SlideCanvas
                slide={slide}
                template={template}
                slideNumber={index + 1}
              />
              <span className="film-number">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <span className="film-label">{intentLabels[template.intent]}</span>
          </button>
        );
      })}
      <button
        className="film-add"
        aria-label="슬라이드 복제하여 추가"
        disabled={deck.slides.length >= 12}
        onClick={onDuplicate}
      >
        <Plus size={22} />
        <span>추가</span>
      </button>
    </div>
  );
}

export function StructureBar({
  template,
  approved,
  newerTemplate,
  onChange,
}: {
  template: SlideTemplate;
  approved: SlideTemplate[];
  newerTemplate?: SlideTemplate;
  onChange: (template: SlideTemplate) => void;
}) {
  return (
    <div className="structure-bar">
      <div className="structure-icon">
        <Layers3 size={19} />
      </div>
      <div>
        <span className="mini-label">적용 구조</span>
        <strong>
          {template.name} <span>v{template.version}</span>
        </strong>
        <p>
          의도: {intentLabels[template.intent]} <span>·</span> 슬롯{" "}
          {template.slots.length}개 <span>·</span> 승인된 버전을 사용합니다
        </p>
      </div>
      <div className="structure-select">
        {newerTemplate && (
          <button className="btn small" onClick={() => onChange(newerTemplate)}>
            승인된 v{newerTemplate.version} 적용
          </button>
        )}
        <label htmlFor="template-select">템플릿 바꾸기</label>
        <select
          id="template-select"
          value={templateVersionKey(template)}
          onChange={(event) => {
            const target = approved.find(
              (item) => templateVersionKey(item) === event.target.value,
            );
            if (target) onChange(target);
          }}
        >
          {!approved.some(
            (item) => templateVersionKey(item) === templateVersionKey(template),
          ) && (
            <option value={templateVersionKey(template)}>
              {template.name} · 보존된 v{template.version}
            </option>
          )}
          {approved.map((item) => (
            <option key={item.id} value={templateVersionKey(item)}>
              {item.name} · v{item.version} · {intentLabels[item.intent]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
