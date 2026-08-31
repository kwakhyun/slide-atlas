"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="connection-error">
      <h1>화면을 불러오지 못했어요.</h1>
      <p>작업을 다시 불러올 수 있습니다.</p>
      <button className="btn primary" onClick={reset}>
        다시 시도
      </button>
    </div>
  );
}
