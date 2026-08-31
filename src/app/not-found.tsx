import Link from "next/link";
export default function NotFound() {
  return (
    <div className="connection-error">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>이 페이지는 아직 비어 있어요.</h1>
      <p>스튜디오에서 새로운 이야기를 만들어 보세요.</p>
      <Link href="/studio" className="btn primary">
        스튜디오로 돌아가기
      </Link>
    </div>
  );
}
