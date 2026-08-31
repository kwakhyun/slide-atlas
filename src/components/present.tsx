"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useWorkspace, LoadingWorkspace } from "./workspace";
import { SlideCanvas } from "./slide-canvas";

export function Present({ id }: { id: string }) {
  const { state } = useWorkspace();
  const [index, setIndex] = useState(0);
  const deck = state?.decks.find((d) => d.id === id);
  const length = deck?.slides.length ?? 0;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!length) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, length - 1));
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [length]);
  if (!state) return <LoadingWorkspace />;
  if (!deck)
    return (
      <div className="connection-error">
        <h1>이 작업 공간에 없는 프레젠테이션입니다.</h1>
        <Link className="btn" href="/studio">
          스튜디오로 돌아가기
        </Link>
      </div>
    );
  const slide = deck.slides[Math.max(0, index)],
    template = state.templates.find((t) => t.id === slide.templateId)!;
  return (
    <main className="presentation">
      <header>
        <Link href="/studio">
          <ArrowLeft size={16} />
          스튜디오로
        </Link>
        <span>{deck.title}</span>
        <button
          aria-label="전체 화면"
          onClick={() => {
            if (!document.fullscreenElement)
              void document.documentElement.requestFullscreen().catch(() => {});
            else void document.exitFullscreen();
          }}
        >
          <Maximize2 size={17} />
        </button>
      </header>
      <div className="presentation-canvas">
        <SlideCanvas
          slide={slide}
          template={template}
          slideNumber={index + 1}
        />
      </div>
      <footer>
        <span>← → 키로 이동</span>
        <div>
          <button
            aria-label="이전 슬라이드"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            <ChevronLeft size={21} />
          </button>
          <span aria-live="polite">
            {index + 1} / {length}
          </span>
          <button
            aria-label="다음 슬라이드"
            disabled={index === length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            <ChevronRight size={21} />
          </button>
        </div>
        <span>SLIDE ATLAS</span>
      </footer>
    </main>
  );
}
