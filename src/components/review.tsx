"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  History,
  Inbox,
  Layers3,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, LoadingWorkspace, useWorkspace } from "./workspace";
import { Modal, PageHeading, StatusBadge } from "./ui";
import { SlideCanvas } from "./slide-canvas";
import { TemplateForm } from "./library";
import {
  type SlideTemplate,
  type TemplateStatus,
  templateInputSchema,
  intentLabels,
  layoutLabels,
} from "@/lib/domain";
import { checkSlide } from "@/lib/quality";

const reviewTabs: Array<{ status: TemplateStatus; label: string }> = [
  { status: "in_review", label: "검수 대기" },
  { status: "draft", label: "초안" },
  { status: "rejected", label: "수정 요청" },
  { status: "approved", label: "승인 완료" },
];
export function Review() {
  const { state, refresh, notify } = useWorkspace();
  const [status, setStatus] = useState<TemplateStatus>("in_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SlideTemplate | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  if (!state) return <LoadingWorkspace />;
  const items = state.templates.filter((t) => t.status === status);
  const template = items.find((t) => t.id === selectedId) ?? items[0];
  const validation = template ? templateInputSchema.safeParse(template) : null;
  const quality = template
    ? checkSlide(
        {
          id: template.id,
          templateId: template.id,
          templateVersion: template.version,
          values: template.sampleContent,
          theme: template.defaultTheme,
        },
        template,
        Object.values(template.sampleContent).join(" "),
      )
    : null;
  const templateEvents = state.events.filter(
    (e) => e.entityType === "template",
  );
  async function transition(next: TemplateStatus) {
    if (!template) return;
    setBusy(true);
    try {
      await api(`/templates/${template.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          status: next,
          expectedVersion: template.version,
          note,
        }),
      });
      await refresh();
      setNote("");
      setSelectedId(null);
      notify(
        next === "approved"
          ? "템플릿을 승인했습니다. 이제 생성과 구조 검색에 사용할 수 있습니다."
          : next === "rejected"
            ? "수정 요청과 검수 근거를 기록했습니다."
            : "검수를 요청했습니다.",
      );
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page review-page">
      <PageHeading
        eyebrow="QUALITY IS A WORKFLOW"
        title="좋은 구조를, 함께 검증하다."
        description="의도와 제약 조건을 확인하고, 승인 근거를 남기세요."
        actions={
          <button className="btn" onClick={() => setHistoryOpen(true)}>
            <History size={15} />
            검수 이력
          </button>
        }
      />
      <div className="review-banner">
        <div className="review-banner-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <strong>생성에 쓰일 데이터는, 검수부터.</strong>
          <p>
            승인된 버전만 생성에 사용됩니다. 템플릿을 수정하면 다시 검수가
            필요합니다.
          </p>
        </div>
        <div className="review-flow">
          <span>초안</span>
          <ChevronRight size={13} />
          <span className="current">검수</span>
          <ChevronRight size={13} />
          <span>승인</span>
        </div>
      </div>
      <div className="review-tabs">
        {reviewTabs.map((tab) => (
          <button
            key={tab.status}
            className={status === tab.status ? "active" : ""}
            aria-pressed={status === tab.status}
            onClick={() => {
              setStatus(tab.status);
              setSelectedId(null);
              setNote("");
            }}
          >
            {tab.label}
            <span>
              {state.templates.filter((t) => t.status === tab.status).length}
            </span>
          </button>
        ))}
      </div>
      {template && quality ? (
        <div className="review-grid">
          <section className="review-queue" aria-label="검수 목록">
            <div className="queue-label">
              <Inbox size={14} />
              <span>REVIEW QUEUE</span>
              <span>{items.length}</span>
            </div>
            {items.map((t) => (
              <button
                key={t.id}
                className={`queue-item ${t.id === template.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(t.id);
                  setNote("");
                }}
              >
                <div className="queue-preview">
                  <SlideCanvas
                    template={t}
                    slide={{
                      id: t.id,
                      templateId: t.id,
                      templateVersion: t.version,
                      values: t.sampleContent,
                      theme: t.defaultTheme,
                    }}
                  />
                </div>
                <div>
                  <strong>{t.name}</strong>
                  <span>
                    {intentLabels[t.intent]} · v{t.version}
                  </span>
                </div>
                <ChevronRight size={14} />
              </button>
            ))}
          </section>
          <section className="review-detail" aria-label="템플릿 검수">
            <div className="review-detail-head">
              <div>
                <StatusBadge status={template.status} />
                <h2>{template.name}</h2>
                <p>
                  {intentLabels[template.intent]} <span>·</span>{" "}
                  {layoutLabels[template.layout]} <span>·</span>{" "}
                  {template.slots.length} slots
                </p>
              </div>
              <button
                className="btn small"
                onClick={() => setEditing(template)}
              >
                <Pencil size={13} />
                수정
              </button>
            </div>
            <div className="review-detail-body">
              <div className="review-preview">
                <SlideCanvas
                  template={template}
                  slide={{
                    id: template.id,
                    templateId: template.id,
                    templateVersion: template.version,
                    values: template.sampleContent,
                    theme: template.defaultTheme,
                  }}
                  showSlots
                />
                <div className="review-caption">
                  <Layers3 size={13} />
                  슬롯 영역과 글자 제한을 함께 확인하세요.
                </div>
              </div>
              <div className="review-checklist">
                <div className="section-label">
                  <span>PRE-FLIGHT CHECK</span>
                  <span>
                    {validation?.success ? "스키마 정상" : "스키마 오류"}
                  </span>
                </div>
                <div
                  className={`review-check ${validation?.success ? "pass" : "error"}`}
                >
                  <CircleCheck size={15} />
                  <div>
                    <strong>온톨로지 스키마</strong>
                    <p>필수 제목·슬롯 중복·좌표·예시 데이터 검사</p>
                  </div>
                </div>
                {quality.checks
                  .filter((c) => !["approval", "source-numbers"].includes(c.id))
                  .map((c) => (
                    <div key={c.id} className={`review-check ${c.status}`}>
                      {c.status === "pass" ? (
                        <CircleCheck size={15} />
                      ) : (
                        <TriangleAlert size={15} />
                      )}
                      <div>
                        <strong>{c.name}</strong>
                        <p>{c.message}</p>
                      </div>
                    </div>
                  ))}
                <div className="human-check">
                  <ShieldCheck size={17} />
                  <p>
                    자동 검사는 디자인 의도와 가독성을 완전히 판단하지 못합니다.
                    미리보기를 확인하고 승인해 주세요.
                  </p>
                </div>
              </div>
            </div>
            {status !== "approved" ? (
              <div className="review-decision">
                <label htmlFor="review-note" className="field-label">
                  검수 근거 <span>5자 이상 · 변경 이력에 저장됩니다</span>
                </label>
                <textarea
                  id="review-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder={
                    status === "in_review"
                      ? "예: 전달 의도와 슬롯 구성이 일치하며, 예시 텍스트의 가독성을 확인했습니다."
                      : "어떤 내용을 확인받고 싶은지 남겨 주세요."
                  }
                />
                <div className="review-decision-actions">
                  <span>
                    <Clock3 size={12} />v{template.version} 기준으로 검수합니다
                  </span>
                  {status === "in_review" ? (
                    <>
                      <button
                        className="btn danger"
                        disabled={busy || note.trim().length < 5}
                        onClick={() => void transition("rejected")}
                      >
                        <X size={15} />
                        수정 요청
                      </button>
                      <button
                        className="btn green"
                        disabled={
                          busy ||
                          note.trim().length < 5 ||
                          !validation?.success ||
                          quality.errors > 0
                        }
                        onClick={() => void transition("approved")}
                      >
                        {busy ? (
                          <Loader2 className="spin" size={15} />
                        ) : (
                          <Check size={15} />
                        )}
                        승인하기
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn dark"
                      disabled={busy || note.trim().length < 5}
                      onClick={() => void transition("in_review")}
                    >
                      <Send size={14} />
                      검수 요청
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="approved-note">
                <CheckCheck size={19} />
                <span>
                  이 버전은 생성에 사용할 수 있습니다. 수정 시 승인 상태가
                  해제됩니다.
                </span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="empty-state review-empty">
          <CheckCheck size={38} />
          <h2>이 단계의 작업을 모두 마쳤어요.</h2>
          <p>
            라이브러리에서 새로운 구조를 등록하고 검수를 요청할 수 있습니다.
          </p>
          <Link className="btn" href="/library">
            라이브러리로 이동 <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <section className="recent-activity">
        <div className="section-title">
          <h2>
            <History size={16} />
            최근 변경 이력
          </h2>
          <button className="text-btn" onClick={() => setHistoryOpen(true)}>
            모두 보기 <ArrowRight size={12} />
          </button>
        </div>
        {templateEvents.slice(0, 4).map((event) => (
          <div className="activity-row" key={event.id}>
            <span
              className={`activity-dot ${event.action.includes("approved") ? "green" : ""}`}
            />
            <div>
              <strong>{event.detail}</strong>
              <span>{event.action}</span>
            </div>
            <time>
              {new Date(event.createdAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </time>
          </div>
        ))}
      </section>
      {editing && (
        <TemplateForm template={editing} onClose={() => setEditing(null)} />
      )}
      {historyOpen && (
        <Modal
          title="검수·변경 이력"
          subtitle="상태 전이와 근거를 트랜잭션 안에서 함께 기록합니다. 최근 100건."
          onClose={() => setHistoryOpen(false)}
        >
          <div className="modal-body history-list">
            {templateEvents.map((event) => (
              <div className="history-item" key={event.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{event.detail}</strong>
                  <span>
                    {event.action} ·{" "}
                    {new Date(event.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
