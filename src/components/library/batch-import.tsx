"use client";
import { useState } from "react";
import { startOperation } from "@/lib/operation-client";
import { type PptxExtractionResult, type SlideTemplate } from "@/lib/domain";
import { useWorkspace } from "../workspace-state";
export function BatchImport({ result }: { result: PptxExtractionResult }) {
  const { commitTemplate, notify } = useWorkspace();
  const [selected, setSelected] = useState<number[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const indices = selected.filter((index) => !completed.includes(index));
    try {
      await startOperation(
        {
          id: crypto.randomUUID(),
          kind: "import",
          templates: indices.map((index) => result.candidates[index].template),
        },
        "",
        (job) => {
          job.items.forEach((item, i) => {
            const index = indices[i];
            if (item.status === "completed") {
              commitTemplate(item.result as SlideTemplate);
              setCompleted((c) => (c.includes(index) ? c : [...c, index]));
              setMessages((m) => ({ ...m, [index]: "초안 등록 완료" }));
            } else if (item.status === "failed")
              setMessages((m) => ({
                ...m,
                [index]: item.error ?? "등록 실패",
              }));
          });
        },
      );
    } catch (error) {
      notify(
        `${(error as Error).message} 작업 진행과 실패 복구에서 이어서 처리할 수 있습니다.`,
        true,
      );
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
