import {
  ArrowRight,
  Loader2,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { EXAMPLE_BRIEF } from "@/lib/catalog";

import type { useStudioController } from "./use-studio-controller";

type Controller = ReturnType<typeof useStudioController>;

export function StudioInputPanel({
  tab,
  setTab,
  brief,
  setBrief,
  count,
  setCount,
  provider,
  setProvider,
  accessCode,
  setAccessCode,
  busy,
  generate,
  template,
  slide,
  editValue,
  endGroup,
  state,
}: Pick<
  Controller,
  | "tab"
  | "setTab"
  | "brief"
  | "setBrief"
  | "count"
  | "setCount"
  | "provider"
  | "setProvider"
  | "accessCode"
  | "setAccessCode"
  | "busy"
  | "generate"
  | "template"
  | "slide"
  | "editValue"
  | "endGroup"
> & { state: import("@/lib/domain").WorkspaceState }) {
  return (
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
                onChange={(e) => setProvider(e.target.value as typeof provider)}
              >
                <option value="deterministic">규칙 기반 · 무료</option>
                <option value="openai" disabled={!state.aiAvailable}>
                  OpenAI
                  {!state.aiAvailable ? " · 연결 전" : " · 초대 코드"}
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
                    [...(slide.values[slot.key] ?? "")].length > slot.maxChars
                      ? "over-budget"
                      : ""
                  }
                >
                  {[...(slide.values[slot.key] ?? "")].length}/{slot.maxChars}
                </span>
              </label>
              <textarea
                id={`slot-${slot.key}`}
                rows={slot.role === "body" || slot.role === "title" ? 3 : 2}
                value={slide.values[slot.key] ?? ""}
                maxLength={2000}
                onChange={(e) => editValue(slot.key, e.target.value)}
                onBlur={endGroup}
              />
              <span className="slot-key">
                {slot.key} <span>· {slot.role}</span>
              </span>
            </div>
          ))}
          <p className="content-save-note">
            변경 내용은 미리보기에 즉시 반영됩니다. 저장은 상단 버튼에서 한 번만
            진행합니다.
          </p>
        </div>
      )}
    </section>
  );
}
