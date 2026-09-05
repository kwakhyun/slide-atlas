"use client";
import { canEdit } from "@/lib/permissions";
import { useState } from "react";
import { startOperation } from "@/lib/operation-client";
import { api } from "@/lib/api-client";
import type { templateImpact, ImpactCorrections } from "@/lib/template-impact";
import { useWorkspace } from "../workspace-state";
import { SlideCanvas } from "../slide-canvas";
type Impact = ReturnType<typeof templateImpact>;
export function TemplateImpactPanel({ id }: { id: string }) {
  const { refresh, notify, state } = useWorkspace();
  const [data, setData] = useState<{
    templateVersion: number;
    items: Impact[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [corrections, setCorrections] = useState<
    Record<string, ImpactCorrections>
  >({});
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
      setCorrections({});
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
      const decks = data.items
        .filter((d) => selected.includes(d.id))
        .map((d) => ({
          id: d.id,
          expectedVersion: d.version,
          corrections: corrections[d.id],
        }));
      const job = await startOperation({
        id: crypto.randomUUID(),
        kind: "impact",
        templateId: id,
        templateVersion: data.templateVersion,
        decks,
      });
      setResults(
        job.items.map((item, index) => ({
          id: decks[index].id,
          ok: item.status === "completed",
          message:
            item.status === "completed"
              ? "적용 완료"
              : (item.error ?? "취소됨"),
        })),
      );
      setSelected([]);
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  function edit(
    item: Impact,
    change: Impact["changes"][number],
    patch: Partial<ImpactCorrections[string]>,
  ) {
    setCorrections((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        [change.before.id]: {
          ...(current[item.id]?.[change.before.id] ?? {
            values: change.after.values,
            reviewedUnmapped: [],
          }),
          ...patch,
        },
      },
    }));
    setSelected((current) => current.filter((id) => id !== item.id));
  }
  return (
    <section className="operation-panel">
      <h3>기존 프레젠테이션 갱신</h3>
      <p>
        전후 슬라이드와 누락 내용을 확인하세요. 직접 수정한 값은 서버에서 다시
        검사하며 적용 후에는 원문 근거를 다시 연결해야 합니다.
      </p>
      <button className="btn" disabled={busy} onClick={() => void preview()}>
        변경 영향 확인
      </button>
      {data && (
        <>
          <p>영향받는 프레젠테이션 {data.items.length}개</p>
          {data.items.map((item) => {
            const unreviewed = item.changes.some((c) =>
              c.missing.some(
                (m) =>
                  !corrections[item.id]?.[
                    c.before.id
                  ]?.reviewedUnmapped.includes(m.key),
              ),
            );
            return (
              <article key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    disabled={
                      busy ||
                      unreviewed ||
                      !canEdit(state?.role) ||
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
                  {unreviewed ? " · 누락 내용 검토 필요" : ""}
                </label>
                <details>
                  <summary>적용 전후 내용과 경고</summary>
                  {item.changes.map((c) => {
                    const correction = corrections[item.id]?.[c.before.id];
                    const after = {
                      ...c.after,
                      values: correction?.values ?? c.after.values,
                    };
                    return (
                      <div key={c.index} className="impact-change">
                        <h4>{c.index + 1}번 슬라이드</h4>
                        <div className="comparison-previews">
                          <figure>
                            <figcaption>
                              이전 · v{c.before.templateVersion}
                            </figcaption>
                            <SlideCanvas
                              template={c.sourceTemplate}
                              slide={c.before}
                            />
                          </figure>
                          <figure>
                            <figcaption>
                              적용할 내용 · v{after.templateVersion}
                            </figcaption>
                            <SlideCanvas
                              template={c.targetTemplate}
                              slide={after}
                            />
                          </figure>
                        </div>
                        {c.missing.map((m) => (
                          <p key={m.key}>
                            <strong>자동으로 옮기지 못한 {m.label}</strong>:{" "}
                            {m.text}
                          </p>
                        ))}
                        {c.targetTemplate.slots.map((slot) => (
                          <label key={slot.key}>
                            {slot.label}
                            <textarea
                              disabled={busy || !canEdit(state?.role)}
                              rows={2}
                              maxLength={slot.maxChars}
                              value={after.values[slot.key] ?? ""}
                              onChange={(e) =>
                                edit(item, c, {
                                  values: {
                                    ...after.values,
                                    [slot.key]: e.target.value,
                                  },
                                  reviewedUnmapped: [],
                                })
                              }
                            />
                          </label>
                        ))}
                        {c.missing.length > 0 && (
                          <label>
                            <input
                              type="checkbox"
                              disabled={busy || !canEdit(state?.role)}
                              checked={c.missing.every((m) =>
                                correction?.reviewedUnmapped.includes(m.key),
                              )}
                              onChange={(e) =>
                                edit(item, c, {
                                  reviewedUnmapped: e.target.checked
                                    ? c.missing.map((m) => m.key)
                                    : [],
                                })
                              }
                            />
                            누락 내용을 위 입력란에 옮겼거나 제외하기로
                            결정했으며, 이 수정본을 확인했습니다.
                          </label>
                        )}
                        {c.report.checks
                          .filter((check) => check.status !== "pass")
                          .map((check) => (
                            <p key={check.id}>
                              {check.message} (자동 매핑 기준, 적용 시 다시
                              검사)
                            </p>
                          ))}
                      </div>
                    );
                  })}
                </details>
              </article>
            );
          })}
          <button
            className="btn"
            disabled={busy || !selected.length || !canEdit(state?.role)}
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
