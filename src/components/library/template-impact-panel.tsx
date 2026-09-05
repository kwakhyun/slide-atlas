"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { templateImpact } from "@/lib/template-impact";
import { useWorkspace } from "../workspace-state";
export function TemplateImpactPanel({ id }: { id: string }) {
  const { refresh, notify } = useWorkspace();
  const [data, setData] = useState<{
    templateVersion: number;
    items: ReturnType<typeof templateImpact>[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    { id: string; ok: boolean; message: string }[]
  >([]);
  async function preview() {
    setBusy(true);
    try {
      setData(await api(`/templates/${id}/impact`));
      setSelected([]);
      setResults([]);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!data) return;
    setBusy(true);
    try {
      const result = await api<typeof results>(`/templates/${id}/impact`, {
        method: "POST",
        body: JSON.stringify({
          templateVersion: data.templateVersion,
          decks: data.items
            .filter((d) => selected.includes(d.id))
            .map((d) => ({ id: d.id, expectedVersion: d.version })),
        }),
      });
      setResults(result);
      setSelected([]);
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operation-panel">
      <h3>기존 프레젠테이션 갱신</h3>
      <p>
        적용 전에 바뀌는 내용과 품질 경고를 확인하세요. 근거 연결은 새 배치에서
        다시 확인해야 합니다.
      </p>
      <button className="btn" disabled={busy} onClick={() => void preview()}>
        변경 영향 확인
      </button>
      {data && (
        <>
          <p>영향받는 프레젠테이션 {data.items.length}개</p>
          {data.items.map((item) => (
            <div key={item.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={
                    busy ||
                    item.blocked ||
                    results.some((r) => r.id === item.id && r.ok)
                  }
                  checked={selected.includes(item.id)}
                  onChange={(e) =>
                    setSelected((current) =>
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.title} · {item.changes.length}장
                {item.blocked ? " · 내용 매핑 확인 필요" : ""}
              </label>
              <details>
                <summary>적용 전후 내용과 경고</summary>
                {item.changes.map((c) => (
                  <div key={c.index}>
                    <strong>{c.index + 1}번 슬라이드</strong>
                    <pre>
                      {JSON.stringify(
                        {
                          이전: c.before.values,
                          이후: c.after.values,
                          옮기지못한내용: c.unmapped,
                          경고: c.report.checks
                            .filter((check) => check.status !== "pass")
                            .map((check) => check.message),
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                ))}
              </details>
            </div>
          ))}
          <button
            className="btn"
            disabled={busy || !selected.length}
            onClick={() => void apply()}
          >
            선택한 프레젠테이션에 적용
          </button>
        </>
      )}
      {results.map((r) => (
        <p key={r.id} role="status">
          {data?.items.find((d) => d.id === r.id)?.title}: {r.message}
        </p>
      ))}
    </section>
  );
}
