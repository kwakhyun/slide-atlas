# Slide Atlas

**디자인 온톨로지를 등록하고, 검수한 구조에서 슬라이드를 만들고, 검색 품질을 실험하는 프로덕트 엔지니어링 워크벤치.**

[![Verify product](https://github.com/kwakhyun/slide-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/kwakhyun/slide-atlas/actions/workflows/ci.yml)

**[라이브 데모 열기](https://slide-atlas-mu.vercel.app)** · [PostgreSQL CI 통과 기록](https://github.com/kwakhyun/slide-atlas/actions/runs/33348337474)

로그인이나 API 키 없이 체험할 수 있다. 현재 공개 배포는 **규칙 기반 생성 + 임시 세션 저장**이며, 서버 재시작·인스턴스 변경 시 작업이 초기화될 수 있다. 보관할 결과는 PPTX 또는 JSON으로 내려받는다. 외부 PostgreSQL과 실제 OpenAI 호출은 공개 환경에서 아직 활성화하지 않았다.

[프로젝트 기획](docs/product-brief.md) · [아키텍처](docs/architecture.md) · [REST API](docs/api.md) · [배포·검증 기록](docs/verification.md) · [평가 원본](docs/evaluation.json) · [보안·한계](SECURITY.md)

![Slide Atlas — 실제 스튜디오 화면](docs/screenshots/studio.png)

## 어떤 문제를 풀었나

AI 프레젠테이션을 운영 가능한 제품으로 만들려면 “한 번 생성된다”를 넘어 다음 질문에 답해야 한다.

- 이 템플릿은 **어떤 내용을 담기에 적합한가?**
- 내용이나 스타일을 바꿔도 **어떤 제약은 유지돼야 하는가?**
- 운영자는 **무엇을 확인하고 승인했는가?**
- 검색이 좋아졌다는 판단은 **어떤 실험에서 나온 것인가?**

Slide Atlas는 이 질문을 하나의 제품 흐름으로 연결했다. 미리디의 AI 프레젠테이션 프로덕트 엔지니어 채용 업무를 참고해 기획한 **독립 포트폴리오**이며, 미리디 내부 시스템을 재현하거나 실제 업무 성과를 보고하는 프로젝트가 아니다.

| 제작 범위 | 내용                                                        |
| --------- | ----------------------------------------------------------- |
| 제품 기획 | 문제 가설, 운영자 여정, MVP 경계, 검증 기준                 |
| 데이터    | 18개 오리지널 템플릿, 6개 전달 의도, 슬롯·제약·검수 상태    |
| 풀스택    | Next.js / React / TypeScript, REST API, PostgreSQL / JSONB  |
| PoC       | 구조 검색, 내용 대치, 스타일 대치, 품질 검사, OpenAI 어댑터 |
| 운영      | 트랜잭션 감사 이력, 버전 충돌, 세션 격리, 요청·AI 비용 제한 |
| 전달      | 발표 모드, SVG / JSON / 편집 가능한 PPTX, 테스트와 CI       |

## 3분 데모

1. **Studio:** 예시 브리프로 슬라이드를 생성한다. `내용 편집`에서 제목을 바꾸고 `Midnight Ink`를 적용한다. 텍스트가 유지되는지 확인한 뒤 저장하고 PPTX를 내려받는다.
2. **Library → Review:** 템플릿을 복제하거나 새로 등록한다. 초안에서 검수를 요청하고 5자 이상의 검수 근거를 남겨 승인한다. 다시 수정하면 초안으로 돌아간다.
3. **Experiments:** `비교 실험 실행`을 누른다. 같은 24개 질의에서 키워드 검색과 구조 검색을 비교하고 개별 실패 사례와 결과 JSON을 확인한다.

공개 기본 경로는 **LLM을 호출하지 않는 규칙 기반 생성**이다. API 키 없이 데이터 등록부터 검수·생성·편집·내보내기·평가까지 재현할 수 있다. 실제 OpenAI 경로는 구현 및 모의 응답 테스트를 완료했지만, 실 API 호출의 품질·비용·지연 시간은 검증하지 않았다.

## 핵심 구현

### 1. 이미지가 아닌, 재사용할 수 있는 디자인 데이터

템플릿을 `의도 → 레이아웃 → 슬롯 → 제약 조건`으로 정의했다. 슬롯은 역할·정규화 좌표·폰트 크기·글자 한도·필수 여부를 갖는다. UI와 JSON 가져오기가 같은 Zod 계약을 사용해 중복 키, 범위 밖 좌표, 필수 제목 누락, 잘못된 예시 내용을 거절한다.

![온톨로지 라이브러리](docs/screenshots/library.png)

### 2. 승인 근거가 남는 내부 도구

`draft → in_review → approved / rejected` 상태 전이를 명시했다. 승인 시 서버에서도 데이터와 품질 오류를 검사하며, 편집하면 승인이 해제된다. SQL 트랜잭션 안에서 상태와 감사 이벤트를 함께 기록한다. 두 요청이 같은 버전을 수정하면 하나만 성공하고 다른 하나는 `409 VERSION_CONFLICT`를 받는다.

![검수 인박스와 자동 검사](docs/screenshots/review.png)

### 3. 구조·내용·스타일을 분리한 생성과 편집

승인된 템플릿 검색 → 원문 슬롯 배치 → 규칙 검사 → 사용자 편집으로 이어진다. 스타일 변경은 슬롯 값을 바꾸지 않는다. SVG와 PPTX는 같은 슬롯 좌표를 사용하고 PPTX의 텍스트와 도형은 편집할 수 있다. 원문과 사용한 템플릿 버전은 JSON과 발표자 노트에 남긴다.

검사 항목은 필수 내용, 예상 텍스트 넘침, 색 대비, 원문 수치 존재, 승인·버전, 슬롯 구조다. 오류와 경고를 구분하며 **수치 존재 검사는 사실 검증이 아니고, 글자 폭 추정은 실제 렌더링 검사를 대체하지 않는다.**

### 4. 설명 가능한 검색과 재현 가능한 실험

키워드 점수에 온톨로지 동의어·전달 의도·슬롯 수·내용 용량을 더한다. 검색 결과에 점수 이유를 표시하고, 모르는 질의에는 빈 결과를 반환한다. 정답 의도는 평가 때 검색기에 전달하지 않는다. 벡터 DB나 임베딩을 사용했다고 주장하지 않는다.

| 24개 합성 개발 질의 | 키워드 기준선 |     구조 검색 |
| ------------------- | ------------: | ------------: |
| Hit@1               | 70.8% (17/24) | 91.7% (22/24) |
| MRR                 |        0.7431 |        0.9167 |

실행: `npm run eval` · 증거: [evaluation.json](docs/evaluation.json) · 데이터: [evaluation.ts](src/lib/evaluation.ts).

**한계:** 작성자가 만든 작은 개발 평가셋이며 독립 검증셋이 아니다. 같은 ontology와 평가셋으로 구현 방향을 조정했으므로 일반화 성능을 추정할 수 없다. 승인 상태·템플릿을 바꾸면 앱 안에서 실행한 수치는 달라질 수 있다. 검색 연산 시간은 DB·네트워크·LLM을 제외한다. 실제 사용자의 작업 시간 감소나 전환율 개선을 측정하지 않았다.

### 5. 모델을 교체해도 유지되는 제품 경계

OpenAI Responses API의 strict JSON Schema로 **이미 선택한 템플릿의 슬롯 텍스트만** 생성한다. 반환값을 재검증하고 원문에 없는 수치·정의되지 않은 슬롯·용량 초과·거절·불완전 응답을 성공처럼 저장하지 않는다. 원문을 비신뢰 데이터로 취급하며 모델에는 DB·파일·배포 도구 권한을 주지 않는다.

서버 키, 활성화 플래그, 초대 코드, 25초 timeout, 출력 토큰 한도, 전역 일별 요청 한도를 적용했다. 서버리스 환경에서 AI를 켜려면 영속 PostgreSQL도 필요하다. 모델·프롬프트 버전·토큰 사용·시간을 결과에 기록하도록 구현했다. [어댑터](src/server/ai.ts) / [모의 응답 테스트](tests/ai.test.ts)

## 아키텍처

```mermaid
flowchart LR
  UI[React Workbench] --> API[Next.js REST API]
  API --> Repo[Workspace-scoped Repository]
  Repo --> DB[(PostgreSQL / JSONB)]
  API --> Search[Structural Retrieval]
  Search --> Plan[Approved Templates]
  Plan --> Map[Source Mapping / Optional OpenAI]
  Map --> Q[Quality Rules]
  Q --> Deck[Content + Template + Theme]
  Deck --> Output[SVG / Editable PPTX / JSON]
  API --> Eval[Versioned Evaluation Runs]
  Eval --> DB
```

- **Next.js 16.3.3 · React 19 · TypeScript:** 작업 화면과 REST API를 한 저장소에서 개발·배포한다.
- **PostgreSQL + JSONB:** 상태·버전·테넌트 경계는 관계형 컬럼으로, 디자인 슬롯은 구조화된 JSON으로 보관한다.
- **PGlite:** 로컬은 설치 없는 실제 PostgreSQL 엔진을 파일에 저장한다. `DATABASE_URL`을 설정하면 외부 PostgreSQL 드라이버로 전환된다.
- **Zod · Vitest · Playwright · axe:** 경계 검증과 운영 시나리오를 자동화한다.
- **fflate / OOXML:** 외부 이미지 파서 없이 편집 가능한 PowerPoint 패키지를 생성한다.
- **Vercel:** Next.js와 API를 함께 공개한다. 저장 모드는 화면 하단과 `/api/health`에서 확인한다.

상세한 선택 이유와 제외한 대안은 [Architecture](docs/architecture.md)에 기록했다.

## 검증 증거

| 범위                                   | 검증 결과 · 2026-08-31                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TypeScript / ESLint / production build | 통과                                                                                             |
| Vitest                                 | **53개 통과**: 스키마·검색·품질·PPTX·DB 트랜잭션·격리·AI 계약                                    |
| Playwright                             | 로컬·PostgreSQL CI·공개 Vercel URL에서 각각 **17개 통과**: 생성·저장·다운로드·검수·평가·API 경계 |
| 접근성                                 | 5개 화면 × 1440px/390px, 대화상자에 axe WCAG A/AA 자동 위반 없음; 키보드 순환 확인               |
| 독립 PPTX 파싱                         | Python-pptx: 4장, 편집 가능한 텍스트 상자 46개, 발표자 노트 4개; XML well-formed                 |
| 의존성 검사                            | `npm audit`: 취약점 0개, 검사 시점 2026-08-31                                                    |
| 평가 재현                              | `npm run eval -- --check` 통과                                                                   |

로컬 PGlite뿐 아니라 **PostgreSQL 17을 사용하는 GitHub CI에서도 전체 파이프라인이 통과**했다. 앱 코드 `8765dec`의 [실행 기록](https://github.com/kwakhyun/slide-atlas/actions/runs/33348337474)에서 설치·정적 검사·53개 테스트·평가 재현·빌드·17개 브라우저 시나리오 결과를 확인할 수 있다. 공개 Vercel 주소에서도 같은 17개 시나리오를 별도로 실행했다. 재현 명령과 배포 과정에서 발견·수정한 문제는 [배포·검증 기록](docs/verification.md)에 남겼다.

접근성 자동 통과는 모든 보조기술/사용자에 대한 접근성 인증이 아니다. 공개 URL의 저장 시나리오 통과는 같은 실행 중의 저장·재조회를 확인한 것이며 서버 재시작 이후의 보존을 증명하지 않는다.

## 로컬 실행

Node.js 24와 npm이 필요하다. 기본 실행에는 Docker, DB 계정, 모델 API 키가 필요하지 않다.

```bash
git clone https://github.com/kwakhyun/slide-atlas.git
cd slide-atlas
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)으로 접속한다. 첫 방문에 18개 템플릿과 예시 deck이 생성된다. 폰트는 lockfile로 고정된 Pretendard 패키지에서 준비하고 외부 CDN을 호출하지 않는다. 로컬 데이터는 `.data/slide-atlas`에 저장된다.

외부 PostgreSQL을 사용하려면 `.env.example`을 `.env.local`로 복사하고 `DATABASE_URL`을 설정한다. Docker가 있다면 `docker compose up -d`로 로컬 전용 DB를 올릴 수 있다. 예시 기본 연결은 `postgres://atlas:atlas-local-only@localhost:5432/atlas`이며 외부 운영에 이 비밀번호를 사용하면 안 된다. `npm run db:migrate`로 초기 스키마를 적용한다. Dockerfile도 제공하지만 로컬 Docker 빌드는 실행하지 않았다.

```bash
npm run lint
npm run typecheck
npm test
npm run eval -- --check
npm run build
npx playwright install chromium
npm run test:e2e
```

AI 활성화는 `.env.example`의 서버 전용 항목을 확인한다. 키를 코드·README·채팅에 붙여넣지 않는다. 브라우저에는 실험용 초대 코드만 입력한다. 기본값은 비활성화다.

## 운영 한계와 다음 단계

- 방문자별 HttpOnly 쿠키 공간은 데모 격리이며 기업용 계정·RBAC가 아니다. URL을 공유해도 다른 방문자의 deck에 접근할 수 없다.
- 보관 기간은 7일이다. 만료 데이터는 다음 새 workspace 생성 시 정리된다. Vercel에서 외부 DB가 없으면 세션 메모리 모드로 인스턴스 간 저장이 공유되지 않는다.
- 현재 template의 과거 geometry를 불변 snapshot으로 보관하지 않는다. 버전 변경을 경고하며 과거 출력의 완전한 재현은 다음 단계다.
- 숫자·단위·주장 사이의 의미 관계 검증, 실제 글꼴 bounding box, 작성자와 분리된 평가셋, 운영자 사용성 관찰이 후속 우선순위다.
- 대규모 검색 성능, 기업 보안 인증, 실시간 협업, 상용 LLM 품질/비용, 운영자의 업무 성과는 검증 범위 밖이다.

## AI 활용과 출처

코드와 문서는 AI 코딩 도구를 활용해 기획·구현했으며, 자동화 테스트와 실제 브라우저 검증 결과를 증거로 남겼다. UI의 생성 엔진과 개발에 사용한 AI 도구는 구분한다. 규칙 기반 결과를 실제 LLM 응답으로 표시하지 않는다.

템플릿·예시 문구·슬라이드 그래픽은 이 프로젝트를 위해 제작했다. 예시의 **40%·120개·96%는 가상 데이터**이며 실제 성과가 아니다. 미리디·미리캔버스의 비공개 템플릿, 브랜드 자산, 고객 데이터는 사용하지 않았다. Pretendard는 [SIL Open Font License](public/fonts/OFL.txt), Lucide 아이콘은 ISC 라이선스를 따른다. 프로젝트 코드는 [MIT](LICENSE)다.
