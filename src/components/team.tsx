"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useApiResource } from "./use-api-resource";
import { useWorkspace } from "./workspace-state";
import { PageHeading } from "./ui";
type Role = "owner" | "editor" | "reviewer" | "viewer";
const labels: Record<Role, string> = {
  owner: "소유자",
  editor: "작성자",
  reviewer: "검수자",
  viewer: "열람자",
};
type Account = {
  session: {
    accountId: string;
    username: string;
    workspaceId: string;
    role: Role;
  } | null;
  memberships: { workspaceId: string; role: Role }[];
};
export function Team() {
  const { state, notify } = useWorkspace(),
    account = useApiResource<Account>("/account");
  const members = useApiResource<{
    members: { id: string; username: string; role: Role }[];
  }>(account.data?.session ? "/team" : null);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [invite, setInvite] = useState(""),
    [role, setRole] = useState<"editor" | "reviewer" | "viewer">("editor"),
    [busy, setBusy] = useState(false),
    [newPassword, setNewPassword] = useState("");
  async function action(path: string, data: unknown, reload = true) {
    setBusy(true);
    try {
      const result = await api<{ code?: string }>(path, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (result.code) setInvite(result.code);
      if (reload) window.location.reload();
      else members.retry();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page team-page">
      <PageHeading
        eyebrow="TEAM"
        title="계정과 팀 작업 공간"
        description="작성, 검수와 열람 권한을 나누고 팀원을 초대합니다."
      />
      <section className="operation-panel">
        <h2>
          {account.data?.session
            ? `${account.data.session.username} · ${labels[account.data.session.role]}`
            : "내 작업 공간 연결하기"}
        </h2>
        {account.error && (
          <p role="alert">
            {account.error}
            <button className="btn" onClick={account.retry}>
              다시 확인
            </button>
          </p>
        )}
        {account.loading ? (
          <p role="status">계정 정보를 확인하고 있습니다.</p>
        ) : !account.data?.session ? (
          <>
            <p>
              계정을 만들면 지금 작업 중인 디자인을 연결하고 팀원을 초대할 수
              있습니다.
            </p>
            <form
              aria-label="계정 만들기와 로그인"
              onSubmit={(event) => {
                event.preventDefault();
                const submitter = (event.nativeEvent as SubmitEvent).submitter;
                const accountAction =
                  submitter instanceof HTMLButtonElement &&
                  submitter.value === "login"
                    ? "login"
                    : "register";
                void action("/account", {
                  action: accountAction,
                  username,
                  password,
                });
              }}
            >
              <label htmlFor="account-name">계정 이름</label>
              <input
                id="account-name"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={3}
                maxLength={32}
                pattern="(?:[a-z0-9_]|-){3,32}"
                aria-describedby="account-name-hint"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p id="account-name-hint" className="field-hint">
                영문 소문자, 숫자, 밑줄과 하이픈으로 3~32자
              </p>
              <label htmlFor="account-password">비밀번호</label>
              <input
                id="account-password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
                aria-describedby="account-password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p id="account-password-hint" className="field-hint">
                12자 이상 입력해 주세요. 이메일을 통한 계정 복구는 지원하지
                않습니다.
              </p>
              <div className="account-actions">
                <button
                  className="btn primary"
                  type="submit"
                  value="register"
                  disabled={busy || !state || !!account.error}
                >
                  현재 공간으로 계정 만들기
                </button>
                <button
                  className="btn"
                  type="submit"
                  value="login"
                  disabled={busy || !!account.error}
                >
                  로그인
                </button>
              </div>
            </form>
            <details className="account-recovery">
              <summary>로그인에 문제가 있나요?</summary>
              <p>
                이전에 사용한 세션 정보 때문에 로그인이 안 된다면 세션을 지운 뒤
                다시 시도해 주세요.
              </p>
              <button
                className="btn"
                disabled={busy}
                onClick={() => void action("/account", { action: "logout" })}
              >
                만료된 세션 지우기
              </button>
            </details>
          </>
        ) : (
          <>
            <p>작업 공간 {account.data.session.workspaceId}</p>
            <label htmlFor="team-workspace">내 작업 공간</label>
            <select
              id="team-workspace"
              disabled={busy}
              value={account.data.session.workspaceId}
              onChange={(e) =>
                void action("/account", {
                  action: "switch",
                  workspaceId: e.target.value,
                })
              }
            >
              {account.data.memberships.map((m) => (
                <option key={m.workspaceId} value={m.workspaceId}>
                  {labels[m.role]} · {m.workspaceId}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={busy}
              onClick={() => void action("/account", { action: "logout" })}
            >
              로그아웃
            </button>
            <details>
              <summary>비밀번호 변경</summary>
              <label htmlFor="current-password">현재 비밀번호</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="new-password">새 비밀번호</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void action("/account", {
                    action: "password",
                    currentPassword: password,
                    password: newPassword,
                  })
                }
              >
                비밀번호 변경 및 다른 세션 종료
              </button>
            </details>
            <h3>팀 참여</h3>
            <label htmlFor="join-code">초대 코드</label>
            <input
              id="join-code"
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="btn"
              disabled={busy || !code}
              onClick={() => void action("/team", { action: "join", code })}
            >
              초대받은 작업 공간 참여
            </button>
            {account.data.session.role === "owner" && (
              <>
                <h3>팀원 초대</h3>
                <label htmlFor="invite-role">초대할 역할</label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                >
                  {(["editor", "reviewer", "viewer"] as const).map((r) => (
                    <option key={r} value={r}>
                      {labels[r]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void action("/team", { action: "invite", role }, false)
                  }
                >
                  1회용 초대 코드 만들기
                </button>
                {invite && (
                  <p role="status">
                    24시간 이내 1회 사용:{" "}
                    <code className="invite-code">{invite}</code>
                  </p>
                )}
              </>
            )}
            <h3>구성원</h3>
            {members.data?.members.map((m) => (
              <p key={m.id}>
                {m.username} · {labels[m.role]}
                {account.data?.session?.role === "owner" &&
                  m.role !== "owner" && (
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          "/team",
                          { action: "remove", accountId: m.id },
                          false,
                        )
                      }
                    >
                      권한 해제
                    </button>
                  )}
              </p>
            ))}
            {members.error && <p role="alert">{members.error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
