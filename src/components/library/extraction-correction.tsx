"use client";
import { useState } from "react";
import {
  templateInputSchema,
  slotSchema,
  type PptxExtractionCandidate,
  type TemplateInput,
  type Slot,
} from "@/lib/domain";
export function ExtractionCorrection({
  candidate,
  onChange,
}: {
  candidate: PptxExtractionCandidate;
  onChange: (template: TemplateInput) => void;
}) {
  const [draft, setDraft] = useState(candidate.template);
  const [saved, setSaved] = useState(false);
  const validation = templateInputSchema.safeParse(draft);
  function edit(key: string, patch: Partial<Slot>) {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.key === key ? { ...slot, ...patch } : slot,
      ),
    }));
  }
  return (
    <details className="operation-panel">
      <summary>원본 위치와 추출 내용 교정</summary>
      <p>
        아래 도형은 추출한 텍스트 위치입니다. 원본 PPTX의 이미지나 글꼴을 재현한
        화면이 아닙니다. 추론 점수는 정확도 확률이 아닙니다.
      </p>
      <svg
        viewBox="0 0 1000 562.5"
        role="img"
        aria-label="추출한 원본 텍스트 위치"
        className="source-block-map"
      >
        {candidate.source.blocks?.map((block, index) => (
          <g key={index}>
            <rect
              x={block.x * 1000}
              y={block.y * 562.5}
              width={block.w * 1000}
              height={block.h * 562.5}
              fill="#e7f6f7"
              stroke="#007a83"
            />
            <text
              x={block.x * 1000 + 4}
              y={block.y * 562.5 + 16}
              fontSize="14"
              fill="#20252b"
            >
              {index + 1}. {block.name.slice(0, 20)}
            </text>
          </g>
        ))}
      </svg>
      <details>
        <summary>추출한 원문 확인</summary>
        {candidate.source.blocks?.map((block, index) => (
          <p key={index}>
            {index + 1}. {block.text}
          </p>
        ))}
      </details>
      <p>
        위에서 아래 순서로 읽습니다. 제목은 필수 슬롯으로 하나 이상 남겨 주세요.
      </p>
      {draft.slots.map((slot, index) => (
        <article key={slot.key}>
          <strong>
            {index + 1}. {slot.label}
          </strong>
          <div className="account-actions">
            <button
              className="btn small"
              disabled={index === 0}
              onClick={() => {
                const slots = [...draft.slots];
                [slots[index - 1], slots[index]] = [
                  slots[index],
                  slots[index - 1],
                ];
                setDraft({ ...draft, slots });
                setSaved(false);
              }}
            >
              앞으로 이동
            </button>
            <button
              className="btn small"
              disabled={draft.slots.length <= 2}
              onClick={() => {
                const values = { ...draft.sampleContent };
                delete values[slot.key];
                setDraft({
                  ...draft,
                  slots: draft.slots.filter((s) => s.key !== slot.key),
                  sampleContent: values,
                });
                setSaved(false);
              }}
            >
              슬롯 제외
            </button>
          </div>
          <label>
            역할
            <select
              value={slot.role}
              onChange={(e) =>
                edit(slot.key, { role: e.target.value as Slot["role"] })
              }
            >
              {slotSchema.shape.role.options.map((role) => (
                <option key={role} value={role}>
                  {
                    {
                      title: "제목",
                      subtitle: "부제목",
                      body: "본문",
                      label: "항목 이름",
                      value: "수치",
                      caption: "설명",
                      step: "단계",
                    }[role]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={slot.required}
              onChange={(e) => edit(slot.key, { required: e.target.checked })}
            />
            필수 내용
          </label>
          <label>
            내용
            <textarea
              value={draft.sampleContent[slot.key] ?? ""}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  sampleContent: {
                    ...draft.sampleContent,
                    [slot.key]: e.target.value,
                  },
                });
                setSaved(false);
              }}
            />
          </label>
          <div className="slot-coordinate-fields">
            {(["x", "y", "w", "h", "maxChars"] as const).map((field) => (
              <label key={field}>
                {
                  {
                    x: "왼쪽 위치",
                    y: "위쪽 위치",
                    w: "너비",
                    h: "높이",
                    maxChars: "글자 제한",
                  }[field]
                }
                <input
                  type="number"
                  min={field === "maxChars" ? 4 : 0}
                  max={field === "maxChars" ? 500 : 1}
                  step={field === "maxChars" ? 1 : 0.01}
                  value={slot[field]}
                  onChange={(e) =>
                    edit(slot.key, { [field]: e.target.valueAsNumber || 0 })
                  }
                />
              </label>
            ))}
          </div>
        </article>
      ))}
      {!validation.success && (
        <p role="alert">{validation.error.issues[0].message}</p>
      )}
      <button
        className="btn primary"
        disabled={!validation.success}
        onClick={() => {
          if (validation.success) {
            onChange(validation.data);
            setSaved(true);
          }
        }}
      >
        교정 내용을 후보에 반영
      </button>
      {saved && (
        <p role="status">
          교정 내용을 반영했습니다. 후보를 확인한 뒤 등록하세요.
        </p>
      )}
    </details>
  );
}
