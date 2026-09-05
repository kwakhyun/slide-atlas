"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import {
  templateInputSchema,
  type PptxExtractionResult,
  type SlideTemplate,
} from "@/lib/domain";
import { useWorkspace } from "../workspace-state";
const fingerprint = (value: unknown) =>
  JSON.stringify(templateInputSchema.parse(value));
export function BatchImport({ result }: { result: PptxExtractionResult }) {
  const { state, commitTemplate } = useWorkspace();
  const [selected, setSelected] = useState<number[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const known = new Set(state?.templates.map(fingerprint));
    try {
      for (const index of selected) {
        if (completed.includes(index)) continue;
        const template = result.candidates[index].template;
        const key = fingerprint(template);
        if (known.has(key)) {
          setMessages((m) => ({
            ...m,
            [index]: "같은 템플릿이 이미 있어 제외했습니다.",
          }));
          setCompleted((c) => [...c, index]);
          continue;
        }
        try {
          const saved = await api<SlideTemplate>("/templates", {
            method: "POST",
            body: JSON.stringify(template),
          });
          commitTemplate(saved);
          known.add(key);
          setCompleted((c) => [...c, index]);
          setMessages((m) => ({ ...m, [index]: "초안 등록 완료" }));
        } catch (error) {
          setMessages((m) => ({ ...m, [index]: (error as Error).message }));
        }
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="operation-panel">
      <summary>여러 후보를 초안으로 등록</summary>
      <p>
        후보와 경고를 검토한 뒤 선택하세요. 같은 내용을 건너뛰고 실패한 항목만
        다시 시도할 수 있습니다.
      </p>
      {result.candidates.map((candidate, index) => (
        <div key={candidate.slideNumber}>
          <label>
            <input
              type="checkbox"
              disabled={busy || completed.includes(index)}
              checked={selected.includes(index)}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked
                    ? [...s, index]
                    : s.filter((i) => i !== index),
                )
              }
            />
            {candidate.slideNumber}장: {candidate.template.name}
          </label>
          <p>{candidate.warnings.join(" ")}</p>
          {messages[index] && <p role="status">{messages[index]}</p>}
        </div>
      ))}
      <button
        className="btn"
        disabled={busy || !selected.some((i) => !completed.includes(i))}
        onClick={() => void save()}
      >
        {busy ? "등록 중" : "선택 후보 등록 / 실패 항목 재시도"}
      </button>
    </details>
  );
}
