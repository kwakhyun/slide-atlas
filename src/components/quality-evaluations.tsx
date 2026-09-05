"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import {
  evaluationSnapshotSchema,
  evaluationStatus,
  ratingFields,
  type QualityEvaluation,
  type Rating,
  type EvaluationSnapshot,
} from "@/lib/quality-evaluation";
import { canEdit } from "@/lib/permissions";
import { resolveSlideTemplate } from "@/lib/template-version";
import { checkSlide } from "@/lib/quality";
import { useWorkspace } from "./workspace-state";
import { useApiResource } from "./use-api-resource";
import { SlideCanvas } from "./slide-canvas";
const labels = {
  pending: "평가 대기",
  disputed: "평가 불일치",
  pass: "사람 평가 통과",
  fail: "수정 필요",
};
const judgmentLabels = { pass: "통과", fail: "실패", unsure: "판단 보류" };
export function QualityEvaluations() {
  const { state, notify } = useWorkspace();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [deckId, setDeckId] = useState(""),
    [busy, setBusy] = useState(false),
    [imports, setImports] = useState<EvaluationSnapshot[]>([]);
  const resource = useApiResource<QualityEvaluation[]>(
    state && open ? "/quality-evaluations" : null,
  );
  async function write(method: string, data: unknown) {
    setBusy(true);
    try {
      const result = await api<{ id?: string }>("/quality-evaluations", {
        method,
        body: JSON.stringify(data),
      });
      if (result.id) setSelected(result.id);
      resource.retry();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const item = resource.data?.find((i) => i.id === selected);
  return (
    <details
      className="operation-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>AI 결과와 편집 품질 검토</summary>
      <p>
        저장본의 원문, 결과와 템플릿을 고정된 사본으로 보관합니다. 서로 다른 두
        계정이 판정하며, 계정 구분만으로 평가자의 실제 독립성을 입증하지는
        않습니다. 규칙 기반 결과도 평가할 수 있습니다.
      </p>
      <label>
        평가할 저장본
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
          <option value="">프레젠테이션 선택</option>
          {state?.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · v{d.version}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        disabled={busy || !deckId || !canEdit(state?.role)}
        onClick={() =>
          void write("POST", {
            deckId,
            expectedVersion: state?.decks.find((d) => d.id === deckId)?.version,
          })
        }
      >
        평가 사본 만들기
      </button>
      <label>
        비공개 라이브 평가 자료 가져오기
        <input
          type="file"
          accept=".json"
          disabled={busy || !canEdit(state?.role)}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 8 * 1024 * 1024)
                throw new Error("평가 파일은 8MB 이하여야 합니다.");
              const value: unknown = JSON.parse(await file.text());
              if (!Array.isArray(value) || value.length > 50)
                throw new Error("평가 사본 배열이 필요합니다.");
              setImports(value.map((v) => evaluationSnapshotSchema.parse(v)));
            } catch (error) {
              notify((error as Error).message, true);
            }
          }}
        />
      </label>
      {imports.map((snapshot, index) => (
        <button
          className="btn small"
          key={index}
          disabled={busy}
          onClick={() => void write("POST", { snapshot })}
        >
          {snapshot.name} 가져오기
        </button>
      ))}
      {resource.error && (
        <p role="alert">
          {resource.error}
          <button className="btn" onClick={resource.retry}>
            다시 불러오기
          </button>
        </p>
      )}
      <label>
        보관한 평가
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">평가 선택</option>
          {resource.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.data.name} · {labels[evaluationStatus(i)]}
              {i.regression ? " · 재평가 대상" : ""}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <EvaluationDetail
          key={`${item.id}-${item.version}`}
          item={item}
          busy={busy}
          onWrite={(data) =>
            void write("PATCH", {
              id: item.id,
              expectedVersion: item.version,
              ...data,
            })
          }
        />
      )}
      {resource.data?.some((i) => i.regression) && (
        <button
          className="btn"
          onClick={() => {
            const cases = resource
              .data!.filter((i) => i.regression)
              .map((i) => ({
                id: i.id,
                theme: i.data.slides[0].theme,
                count: Math.min(i.data.slides.length, 6),
                brief: i.data.brief,
              }));
            const blob = new Blob(
              [
                JSON.stringify(
                  {
                    datasetVersion: "human-review-regression-v1",
                    disclaimer:
                      "사람 평가 실패 사례에서 보관한 재평가 입력입니다. 독립 홀드아웃이 아닙니다.",
                    cases,
                  },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "quality-regression.private.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          재평가 입력 내려받기 (원문 포함)
        </button>
      )}
    </details>
  );
}
function EvaluationDetail({
  item,
  busy,
  onWrite,
}: {
  item: QualityEvaluation;
  busy: boolean;
  onWrite: (data: Record<string, unknown>) => void;
}) {
  const { state } = useWorkspace();
  const [rating, setRating] = useState<Rating>({
      meaning: "unsure",
      numbers: "unsure",
      constraints: "unsure",
      usable: "unsure",
      note: "",
    }),
    [note, setNote] = useState("");
  const reviewable =
    !!state?.accountId && (state.role === "reviewer" || state.role === "owner");
  const canRate =
    reviewable &&
    state?.accountId !== item.createdBy &&
    !item.ratings.some((r) => r.reviewerId === state?.accountId);
  return (
    <section>
      <h3>{labels[evaluationStatus(item)]}</h3>
      <p>
        출처:{" "}
        {item.data.origin === "workspace"
          ? "저장한 프레젠테이션"
          : "라이브 AI 평가"}{" "}
        · 모델: {item.data.model ?? "모델 기록 없음 / 규칙 기반"}
      </p>
      <h4>원문</h4>
      <pre
        className="quality-source"
        tabIndex={0}
        role="region"
        aria-label="평가 원문"
      >
        {item.data.brief}
      </pre>
      {item.data.slides.map((slide) => {
        const template = resolveSlideTemplate(slide, item.data.templates),
          quality = checkSlide(slide, template, item.data.brief);
        return (
          <details key={slide.id}>
            <summary>
              슬라이드 {item.data.slides.indexOf(slide) + 1} · 자동 오류{" "}
              {quality.errors}개
            </summary>
            <SlideCanvas slide={slide} template={template} />
            {template.slots.map((slot) => (
              <p key={slot.key}>
                <strong>{slot.label}</strong>: {slide.values[slot.key]}
              </p>
            ))}
          </details>
        );
      })}
      {item.ratings.map((r) => (
        <article key={r.reviewerId}>
          <strong>{r.reviewerName}</strong>
          <p>
            {Object.entries(ratingFields)
              .map(
                ([key, label]) =>
                  `${label}: ${judgmentLabels[r.data[key as keyof typeof ratingFields]]}`,
              )
              .join(", ")}
          </p>
          <p>{r.data.note}</p>
        </article>
      ))}
      {item.resolution && (
        <p>
          최종 판단: {judgmentLabels[item.resolution.decision]} ·{" "}
          {item.resolution.actorName}: {item.resolution.note}
        </p>
      )}
      {canRate && item.ratings.length < 2 && !item.resolution && (
        <fieldset disabled={busy}>
          <legend>평가자 판정 (사본 등록 계정 제외)</legend>
          {Object.entries(ratingFields).map(([key, label]) => (
            <label key={key}>
              {label}
              <select
                value={rating[key as keyof typeof ratingFields]}
                onChange={(e) =>
                  setRating({ ...rating, [key]: e.target.value })
                }
              >
                {Object.entries(judgmentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            판정 근거
            <textarea
              rows={3}
              maxLength={1000}
              value={rating.note}
              onChange={(e) => setRating({ ...rating, note: e.target.value })}
            />
          </label>
          <button
            className="btn"
            disabled={rating.note.trim().length < 5}
            onClick={() => onWrite({ action: "rate", rating })}
          >
            평가 결과 저장
          </button>
        </fieldset>
      )}
      {state?.accountId &&
        state.role === "owner" &&
        item.ratings.length === 2 &&
        !item.resolution && (
          <>
            <label>
              최종 판단 근거
              <textarea
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {(["pass", "fail"] as const).map((decision) => (
              <button
                key={decision}
                className="btn"
                disabled={busy || note.trim().length < 10}
                onClick={() => onWrite({ action: "resolve", decision, note })}
              >
                {judgmentLabels[decision]}로 최종 판단
              </button>
            ))}
          </>
        )}
      {reviewable &&
        !item.regression &&
        ["fail", "disputed"].includes(evaluationStatus(item)) && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => onWrite({ action: "regression" })}
          >
            실패 사례를 재평가 대상으로 보관
          </button>
        )}
    </section>
  );
}
