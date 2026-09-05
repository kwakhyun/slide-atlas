"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceProvider, useWorkspace } from "./workspace-state";
export { useWorkspace } from "./workspace-state";

import {
  ArrowUpRight,
  Asterisk,
  BookOpen,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  Layers3,
  LayoutTemplate,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export function Workspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <WorkspaceProvider active={pathname !== "/about"}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}

const navigation = [
  {
    href: "/studio",
    label: "슬라이드 스튜디오",
    shortLabel: "만들기",
    english: "Studio",
    icon: Sparkles,
  },
  {
    href: "/library",
    label: "온톨로지 라이브러리",
    shortLabel: "템플릿",
    english: "Library",
    icon: LayoutTemplate,
  },
  {
    href: "/review",
    label: "검수 인박스",
    shortLabel: "검수",
    english: "Review",
    icon: ShieldCheck,
  },
  {
    href: "/experiments",
    label: "실험실",
    shortLabel: "실험",
    english: "Experiments",
    icon: FlaskConical,
  },
];

function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, error, refresh } = useWorkspace();
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
    <>
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
                  <span className="nav-full-label">{item.label}</span>
                  <span className="nav-short-label">{item.shortLabel}</span>
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
                      : pathname === "/about"
                        ? "프로젝트 가이드"
                        : "연결 중"}
              </span>
            </footer>
          </div>
        </>
      )}
    </>
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
