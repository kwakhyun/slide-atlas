"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Asterisk,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  Layers3,
  LayoutTemplate,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { WorkspaceState } from "@/lib/domain";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.message ?? "요청을 처리하지 못했습니다.",
      result.error?.code ?? "UNKNOWN",
      response.status,
      result.error?.requestId,
    );
  return result.data as T;
}
type ContextValue = {
  state: WorkspaceState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<WorkspaceState>;
  notify: (message: string, error?: boolean) => void;
};
const WorkspaceContext = createContext<ContextValue | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace provider is required");
  return value;
}

const navigation = [
  {
    href: "/studio",
    label: "슬라이드 스튜디오",
    english: "Studio",
    icon: Sparkles,
  },
  {
    href: "/library",
    label: "온톨로지 라이브러리",
    english: "Library",
    icon: LayoutTemplate,
  },
  {
    href: "/review",
    label: "검수 인박스",
    english: "Review",
    icon: ShieldCheck,
  },
  {
    href: "/experiments",
    label: "실험실",
    english: "Experiments",
    icon: FlaskConical,
  },
];

export function Workspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const pending = useRef<Promise<WorkspaceState> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (!pending.current) pending.current = api<WorkspaceState>("/workspace");
    try {
      const data = await pending.current;
      setState(data);
      setError(null);
      return data;
    } catch (error) {
      setError(error instanceof Error ? error.message : "연결하지 못했습니다.");
      throw error;
    } finally {
      pending.current = null;
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5500);
  }, []);
  const current = navigation.find((n) => pathname.startsWith(n.href));
  const content =
    error && !state ? (
      <div className="connection-error">
        <CircleHelp size={36} />
        <h1>작업 공간에 연결하지 못했어요</h1>
        <p>{error}</p>
        <button
          className="btn primary"
          onClick={() => void refresh().catch(() => {})}
        >
          다시 연결
        </button>
      </div>
    ) : (
      children
    );
  return (
    <WorkspaceContext.Provider
      value={{ state, loading, error, refresh, notify }}
    >
      {pathname.startsWith("/present") ? (
        content
      ) : (
        <>
          <a href="#main-content" className="skip-link">
            본문으로 바로가기
          </a>
          <aside className="sidebar" aria-label="워크스페이스 메뉴">
            <Link href="/studio" className="brand" aria-label="Slide Atlas 홈">
              <span className="brand-mark">
                <Asterisk size={30} strokeWidth={3} />
              </span>
              <span>
                slide<span className="brand-light">atlas</span>
                <span className="brand-dot">.</span>
              </span>
            </Link>
            <div className="workspace-label">
              <span className="workspace-icon">
                <Layers3 size={17} />
              </span>
              <div>
                <strong>Design Intelligence</strong>
                <span>Personal workspace</span>
              </div>
              <span className="tiny-dot" />
            </div>
            <div className="nav-label">WORKSPACE</div>
            <nav>
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                  aria-current={
                    pathname.startsWith(item.href) ? "page" : undefined
                  }
                >
                  <item.icon size={19} />
                  <span>{item.label}</span>
                  {item.href === "/review" &&
                    !!state?.templates.filter((t) => t.status === "in_review")
                      .length && (
                      <span className="nav-count">
                        {
                          state.templates.filter(
                            (t) => t.status === "in_review",
                          ).length
                        }
                      </span>
                    )}
                </Link>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="workspace-note">
                <div className="note-icon">
                  <Layers3 size={19} />
                  <span>YOUR OWN SANDBOX</span>
                </div>
                <strong>마음껏 실험하세요.</strong>
                <p>
                  변경사항은 나만의 데모 공간에
                  <br />
                  저장됩니다. 7일 후 자동 삭제.
                </p>
                <Link href="/about">
                  프로젝트 살펴보기 <ArrowUpRight size={14} />
                </Link>
              </div>
              <Link className="sidebar-help" href="/about">
                <BookOpen size={17} />
                <span>프로젝트 가이드</span>
                <ArrowUpRight size={14} />
              </Link>
              <div className="profile">
                <span className="avatar">KH</span>
                <div>
                  <strong>Portfolio workspace</strong>
                  <span>Built by kwakhyun</span>
                </div>
                <span className="status-light" />
              </div>
            </div>
          </aside>
          <div className="app-frame">
            <header className="topbar">
              <div className="breadcrumb">
                <span>Workspace</span>
                <ChevronRight size={13} />
                <strong>{current?.english ?? "Project guide"}</strong>
              </div>
              <div className="topbar-right">
                <span className="engine-badge">
                  <span className="status-light" />
                  {state?.aiAvailable ? "AI 연결됨" : "규칙 기반 데모"}
                </span>
                <Link href="/about" className="topbar-link">
                  <BookOpen size={13} /> 3분 데모
                </Link>
                <a
                  href="https://github.com/kwakhyun/slide-atlas"
                  target="_blank"
                  rel="noreferrer"
                  className="topbar-link"
                >
                  GitHub <ArrowUpRight size={13} />
                </a>
                <span className="avatar small">KH</span>
              </div>
            </header>
            <main id="main-content">{content}</main>
            <footer className="app-footer">
              <span>
                SLIDE ATLAS <span className="footer-divider">/</span> A design
                intelligence workbench
              </span>
              <span>
                {state?.storage === "postgres"
                  ? "PostgreSQL · 독립 공간"
                  : state?.storage === "embedded"
                    ? "Embedded PostgreSQL · 로컬 저장"
                    : state?.storage === "ephemeral"
                      ? "세션 데모 · 서버 재시작 시 초기화"
                      : "연결 중"}
              </span>
            </footer>
          </div>
        </>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}

export function LoadingWorkspace() {
  return (
    <div className="loading-workspace" role="status">
      <Loader2 className="spin" size={24} />
      <p>나만의 작업 공간을 준비하고 있어요.</p>
      <span>템플릿과 예시 슬라이드를 불러옵니다.</span>
    </div>
  );
}
