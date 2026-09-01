import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  FlaskConical,
  Github,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
export const metadata: Metadata = { title: "프로젝트 가이드" };
export default function Page() {
  return (
    <div className="page about-page">
      <div className="eyebrow">PRODUCT ENGINEERING CASE STUDY</div>
      <h1>
        결과물을 만드는 AI에서,
        <br />
        품질을 운영하는 제품으로.
      </h1>
      <p className="about-lead">
        Slide Atlas는 디자인 온톨로지 등록부터 검색, 내용·스타일 대치, 검수와
        실험까지 연결한 독립 포트폴리오 프로젝트입니다.
      </p>
      <div className="about-actions">
        <Link className="btn primary" href="/studio">
          <Sparkles size={16} />
          직접 사용하기
        </Link>
        <a
          className="btn"
          href="https://github.com/kwakhyun/slide-atlas"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          소스와 검증 결과
          <ArrowUpRight size={14} />
        </a>
      </div>
      <div className="about-flow">
        {[
          {
            n: "01",
            icon: Braces,
            title: "의미를 정의하고",
            text: "전달 의도·레이아웃·슬롯·용량으로 디자인 데이터를 정규화합니다.",
            href: "/library",
          },
          {
            n: "02",
            icon: Sparkles,
            title: "내용을 구조에 담고",
            text: "승인된 템플릿을 찾아 원문을 배치하고 스타일을 바꿉니다.",
            href: "/studio",
          },
          {
            n: "03",
            icon: ShieldCheck,
            title: "품질 근거를 남기고",
            text: "필수 내용·글자 수·대비·수치·버전·구조를 검사합니다.",
            href: "/review",
          },
          {
            n: "04",
            icon: FlaskConical,
            title: "다음 실험으로",
            text: "동일한 개발 평가셋에서 검색 전략을 비교하고 기록합니다.",
            href: "/experiments",
          },
        ].map((step) => (
          <Link href={step.href} key={step.n}>
            <span>
              {step.n}
              <step.icon size={22} />
            </span>
            <h2>{step.title}</h2>
            <p>{step.text}</p>
            <ArrowRight size={16} />
          </Link>
        ))}
      </div>
      <div className="about-columns">
        <section>
          <div className="eyebrow">THE PROBLEM</div>
          <h2>
            생성 버튼만으로는
            <br />
            운영의 반복이 줄지 않습니다.
          </h2>
          <p>
            프레젠테이션 자동화를 제품으로 만들려면 템플릿이 언제 적합한지,
            무엇을 바꿀 수 있는지, 결과가 기준을 만족하는지 설명할 수 있어야
            합니다.
          </p>
          <p>
            이 프로젝트는 모델의 표현력보다 먼저{" "}
            <strong>데이터 계약, 승인 워크플로우, 재현 가능한 평가</strong>를
            연결하는 데 집중했습니다.
          </p>
        </section>
        <section>
          <div className="eyebrow">TECHNICAL DECISIONS</div>
          <h2>
            작게 실행하고,
            <br />
            경계를 명확하게.
          </h2>
          <ul>
            <li>
              <strong>TypeScript · Next.js · React</strong>
              <span>작업 화면과 REST API를 하나의 제품으로 연결합니다.</span>
            </li>
            <li>
              <strong>PostgreSQL · JSONB</strong>
              <span>
                관계형 제약과 구조화된 디자인 데이터를 함께 저장합니다. 로컬은
                임베디드 PostgreSQL로 바로 실행됩니다.
              </span>
            </li>
            <li>
              <strong>낙관적 잠금 · 트랜잭션</strong>
              <span>
                오래된 버전의 덮어쓰기를 막고 변경과 감사 이력을 함께
                기록합니다.
              </span>
            </li>
            <li>
              <strong>동일 원본 · 세 가지 내보내기</strong>
              <span>
                슬롯 모델에서 SVG, 편집 가능한 PowerPoint, 구조 JSON을
                생성합니다.
              </span>
            </li>
          </ul>
        </section>
      </div>
      <section className="guide-steps">
        <h2>3분 데모 가이드</h2>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>스튜디오에서 스타일을 바꿔 보세요.</strong>
              <p>
                내용이 유지되는지 확인하고 슬롯 편집에서 텍스트를 길게 입력해
                품질 경고를 확인합니다.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>템플릿을 등록하고 승인해 보세요.</strong>
              <p>
                라이브러리에서 복제 → 초안 저장 → 검수 요청 → 근거 작성 →
                승인으로 이어집니다.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>실험실에서 두 검색기를 비교하세요.</strong>
              <p>
                24개 질의의 실제 Hit@1·MRR과 실패 사례를 보고 JSON 결과를
                내려받습니다.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="limitations">
        <Layers3 size={23} />
        <div>
          <h2>범위와 한계를 함께 공개합니다.</h2>
          <p>
            공개 기본 모드는 LLM을 호출하지 않는 결정적 규칙 기반 데모입니다. AI
            연결 여부는 엔진 선택기에 표시되며, 실제 AI 사용은 운영자 설정과
            초대 코드가 필요합니다.
          </p>
          <p>
            18개 템플릿은 직접 제작했으며 외부 서비스의 비공개 데이터나 자산을
            사용하지 않았습니다. 예시 브리프의 성과 수치는 가상 데이터입니다.
          </p>
          <p>
            24개 질의는 개발용 합성 평가셋으로 실제 사용자 연구를 대체하지
            않습니다. 수치 일치 검사는 사실 검증이 아니며 텍스트 넘침 검사는
            글꼴 폭 추정치입니다. PowerPoint의 글꼴·도형 표현은 뷰어에 따라 다를
            수 있습니다.
          </p>
          <p>
            방문자별 쿠키 공간은 데모 격리용이며 기업용 계정·역할 체계가
            아닙니다. 보관 기간은 7일이며 만료 데이터는 다음 신규 공간 생성 시
            정리됩니다. 서버 메모리 저장 모드에서는 서버 재시작 시 초기화되며
            화면 하단에 저장 모드를 표시합니다.
          </p>
        </div>
      </section>
      <div className="about-signoff">
        <span>DESIGNED, BUILT & TESTED AS AN INDEPENDENT PORTFOLIO</span>
        <a href="https://github.com/kwakhyun" target="_blank" rel="noreferrer">
          kwakhyun <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
