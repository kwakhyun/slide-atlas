"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { continueOperation } from "@/lib/operation-client";
import type { Operation } from "@/lib/operations";
import { canEdit } from "@/lib/permissions";
import { useWorkspace } from "./workspace-state";
import { useApiResource } from "./use-api-resource";
const labels = {
  queued: "계속 처리 가능",
  running: "실행 중",
  completed: "완료",
  failed: "실패 항목 있음",
  cancelled: "취소됨",
  pending: "대기",
};
export function OperationsPanel() {
  const { state, notify, refresh } = useWorkspace();
  const [open, setOpen] = useState(false),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  const resource = useApiResource<Operation[]>(
    state && open ? "/operations" : null,
  );
  const retry = resource.retry;
  useEffect(() => {
    if (!open) return;
    const handle = () => retry();
    window.addEventListener("atlas-operation-changed", handle);
    const interval = setInterval(handle, 3000);
    return () => {
      window.removeEventListener("atlas-operation-changed", handle);
      clearInterval(interval);
    };
  }, [open, retry]);
  async function action(
    job: Operation,
    action: "run" | "retry" | "cancel" | "recover",
  ) {
    if (action !== "cancel") setBusy(job.id);
    try {
      if (action === "run") await continueOperation(job, code);
      else {
        const next = await api<Operation>("/operations", {
          method: "PATCH",
          body: JSON.stringify({ id: job.id, action }),
        });
        if (action === "retry") await continueOperation(next, code);
      }
      resource.retry();
      await refresh();
    } catch (e) {
      notify(
        `${(e as Error).message} 작업 기록에서 상태를 확인해 주세요.`,
        true,
      );
    } finally {
      if (action !== "cancel") setBusy(null);
      resource.retry();
    }
  }
  return (
    <details
      className="operation-panel"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>작업 진행과 실패 복구</summary>
      <p>
        슬라이드 생성과 일괄 작업의 진행 상태를 서버에 저장합니다. 화면을 닫으면
        남은 항목은 대기하며, 이곳에서 이어서 처리할 수 있습니다. 작업을
        취소해도 이미 완료된 항목은 되돌리지 않습니다.
      </p>
      <label>
        모델 작업 재개용 초대 코드
        <input
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      {resource.error && (
        <p role="alert">
          {resource.error}
          <button className="btn" onClick={resource.retry}>
            다시 불러오기
          </button>
        </p>
      )}
      {resource.data?.length === 0 && <p>아직 기록된 작업이 없습니다.</p>}
      {resource.data?.map((job) => (
        <article key={job.id}>
          <h3>
            {
              {
                import: "후보 일괄 등록",
                impact: "템플릿 변경 적용",
                generate: "슬라이드 생성",
              }[job.kind]
            }{" "}
            · {labels[job.status]}
          </h3>
          <p>
            {job.items.filter((i) => i.status === "completed").length}/
            {job.items.length}개 완료 · 작업 {job.id.slice(0, 8)}
          </p>
          <ol>
            {job.items.map((item, index) => (
              <li key={index}>
                {item.label}: {labels[item.status]}
                {item.error && <p role="alert">{item.error}</p>}
              </li>
            ))}
          </ol>
          {canEdit(state?.role) && (
            <>
              {job.status === "queued" && (
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => void action(job, "run")}
                >
                  계속 처리
                </button>
              )}
              {job.status !== "running" &&
                job.items.some((i) => i.status === "failed") && (
                  <button
                    className="btn"
                    disabled={!!busy}
                    onClick={() => void action(job, "retry")}
                  >
                    실패 항목 재시도
                    {job.kind === "generate" ? " (모델 재호출 가능)" : ""}
                  </button>
                )}
              {["queued", "running"].includes(job.status) && (
                <button
                  className="btn"
                  onClick={() => void action(job, "cancel")}
                >
                  남은 작업 취소
                </button>
              )}
              {job.status === "running" && (
                <button
                  className="btn"
                  disabled={
                    !!busy ||
                    !job.leaseUntil ||
                    new Date(job.leaseUntil).getTime() >= Date.now()
                  }
                  onClick={() => void action(job, "recover")}
                >
                  중단 상태 복구 (2분 경과 후)
                </button>
              )}
            </>
          )}
        </article>
      ))}
    </details>
  );
}
