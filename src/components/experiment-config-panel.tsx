"use client";
import { useState } from "react";
import { EVAL_CASES } from "@/lib/evaluation";
import {
  defaultWeights,
  experimentConfigSchema,
  type SavedExperimentConfig,
} from "@/lib/experiment-config";
import { useApiResource } from "./use-api-resource";
import { useWorkspace } from "./workspace-state";
import { api } from "@/lib/api-client";
import type { Experiment } from "@/lib/domain";
export function ExperimentConfigPanel({
  selected,
  onSelect,
  run,
}: {
  selected: string;
  onSelect: (id: string) => void;
  run?: Experiment;
}) {
  const { state, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const resource = useApiResource<SavedExperimentConfig[]>(
    state && open ? "/experiment-configs" : null,
  );
  const [raw, setRaw] = useState(
    JSON.stringify(
      { name: "사용자 검색 실험", cases: EVAL_CASES, weights: defaultWeights },
      null,
      2,
    ),
  );
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const data = experimentConfigSchema.parse(JSON.parse(raw));
      const saved = await api<SavedExperimentConfig>("/experiment-configs", {
        method: "POST",
        body: JSON.stringify(data),
      });
      resource.mutate((c) => [saved, ...(c ?? [])]);
      onSelect(saved.id);
      notify("실험 설정 사본을 저장했습니다.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="operation-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>평가셋과 검색 가중치 설정</summary>
      <label htmlFor="experiment-config">실행할 설정</label>
      <select
        id="experiment-config"
        value={selected}
        onChange={(e) => {
          onSelect(e.target.value);
          const data = resource.data?.find(
            (c) => c.id === e.target.value,
          )?.data;
          if (data) setRaw(JSON.stringify(data, null, 2));
        }}
      >
        <option value="">기본 개발셋 · 24개 질의</option>
        {resource.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.data.name} · {c.hash.slice(0, 8)}
          </option>
        ))}
      </select>
      {resource.error && (
        <p role="alert">
          {resource.error}
          <button className="btn" onClick={resource.retry}>
            설정 다시 불러오기
          </button>
        </p>
      )}
      <p>
        질의, 정답 템플릿 ID와 네 가지 가중치를 JSON으로 편집하거나 가져오세요.
        저장할 때마다 변경 불가능한 설정 사본과 해시를 만듭니다. 직접 작성한
        평가셋은 독립 검증으로 표시하지 않습니다.
      </p>
      <label htmlFor="experiment-json">실험 설정 JSON</label>
      <textarea
        id="experiment-json"
        rows={8}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <label htmlFor="experiment-file">설정 JSON 가져오기</label>
      <input
        id="experiment-file"
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 64000) {
              notify("64KB 이하 파일을 선택하세요.", true);
              return;
            }
            void file
              .text()
              .then(setRaw)
              .catch(() => notify("파일을 읽지 못했습니다.", true));
          }
        }}
      />
      <button className="btn" disabled={busy} onClick={() => void save()}>
        새 설정 사본 저장
      </button>
      {run && (
        <button
          className="btn"
          onClick={() => {
            try {
              const config = experimentConfigSchema.parse(JSON.parse(raw));
              const failures = new Set(
                run.results.filter((r) => !r.structureHit).map((r) => r.id),
              );
              const cases = config.cases.filter((c) => failures.has(c.id));
              if (!cases.length)
                throw new Error("현재 설정에 해당하는 실패 질의가 없습니다.");
              setRaw(
                JSON.stringify(
                  { ...config, name: "실패 사례 회귀 실험", cases },
                  null,
                  2,
                ),
              );
            } catch (e) {
              notify((e as Error).message, true);
            }
          }}
        >
          실패 질의로 회귀 설정 준비
        </button>
      )}
      {run?.configHash && <p>실행 설정 SHA-256: {run.configHash}</p>}
    </details>
  );
}
