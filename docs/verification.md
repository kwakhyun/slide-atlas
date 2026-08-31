# 배포와 검증 기록

검증 시점: 2026-08-31. 아래는 실행한 검사와 실행하지 않은 검사를 구분한 기록이다.

## 공개 결과물

| 항목             | 실제 상태                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| 서비스           | [Slide Atlas](https://slide-atlas-mu.vercel.app)                                                     |
| 저장소           | [kwakhyun/slide-atlas](https://github.com/kwakhyun/slide-atlas)                                      |
| 배포된 앱 코드   | [`8765dec`](https://github.com/kwakhyun/slide-atlas/commit/8765decef18168bff86537aadb95ecfdd698198f) |
| 배포 플랫폼      | Vercel, Next.js, Node.js 24                                                                          |
| 공개 저장소 모드 | 메모리 PGlite (`ephemeral`), 외부 DB 미연결                                                          |
| 생성 엔진        | 규칙 기반, 실제 OpenAI 호출 비활성화                                                                 |
| 인증             | 계정 로그인 없음. HttpOnly 쿠키로 방문자별 데모 공간 분리                                            |

커밋된 런타임 소스와 lockfile을 파일 스냅샷으로 Vercel에 배포했다. 환경 파일, 자격 증명, 로컬 DB, 테스트 산출물은 배포에 포함하지 않았다. 현재 GitHub push는 CI를 실행하지만 Vercel의 Git 자동 배포 연결은 설정하지 않았다. 이후 문서만 수정한 커밋은 위 앱 코드의 동작을 바꾸지 않는다.

[상태 확인 API](https://slide-atlas-mu.vercel.app/api/health)의 비인증 HTTP 200 응답을 확인했다.

```json
{
  "data": {
    "status": "ok",
    "storage": "ephemeral",
    "version": "1.0.0",
    "api": "v1",
    "aiEnabled": false
  }
}
```

이 모드에서 데이터는 서버 재시작 시 초기화되며 인스턴스 간 공유되지 않는다. 브라우저를 새로고침했을 때 같은 데이터가 보였다는 사실만으로 영속 저장을 주장하지 않는다. 중요한 결과는 PPTX 또는 JSON으로 내려받아야 한다. 7일 만료는 세션의 최대 보관 정책이며, 현재 공개 환경이 7일간의 보존을 보장한다는 뜻은 아니다.

## 세 환경에서 확인한 범위

| 환경                     | DB                        | 검증 결과                                                           |
| ------------------------ | ------------------------- | ------------------------------------------------------------------- |
| 로컬 개발·프로덕션 빌드  | 파일 PGlite               | 정적 검사, 53개 단위·통합 테스트, 17개 E2E 시나리오, 평가 재현 통과 |
| GitHub Actions / Ubuntu  | 실제 PostgreSQL 17 서비스 | 설치부터 프로덕션 빌드와 17개 E2E까지 전체 파이프라인 통과          |
| 공개 Vercel 프로덕션 URL | 메모리 PGlite             | 별도 인증 없이 17개 Playwright 시나리오 통과                        |

PostgreSQL CI의 공개 증거: [성공한 실행](https://github.com/kwakhyun/slide-atlas/actions/runs/33348337474), [워크플로우](../.github/workflows/ci.yml). 같은 테스트의 반복 실행이며 53개 또는 17개를 환경 수만큼 합산한 별개의 테스트 수로 보고하지 않는다.

공개 URL 검증은 다음 명령으로 실행했다. PowerShell에서 실행하며 별도의 로컬 서버는 시작하지 않는다.

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://slide-atlas-mu.vercel.app'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

E2E는 데모 공간에 테스트용 데이터를 만든다. 공유 운영 데이터가 있는 URL에 그대로 실행해서는 안 된다. 검사 범위는 다음과 같다.

- Studio, Library, Review, Experiments, About의 데스크톱·모바일 레이아웃과 axe 자동 접근성 검사.
- 대화상자 이름, 키보드 포커스 순환, 모달 닫기.
- 브리프 생성, 내용 수정, 스타일 변경 시 내용 보존, 저장·재조회, PPTX 다운로드, 발표 모드.
- 템플릿 등록, 검수 요청, 승인 근거, 감사 이력, 실험 실행·조회.
- 세션 간 격리, 잘못된 입력·경로·Origin 거절, 요청 한도.

실제 OpenAI 응답은 이 검증에 포함하지 않는다. AI 테스트 9개는 모의 응답으로 구조화 출력 검증, 거절·불완전 응답·원문에 없는 숫자, 예산 경계를 확인한다.

## 파일과 의존성 검증

독립적인 Python-pptx 파서로 샘플 내보내기를 열어 슬라이드 4장, 편집 가능한 텍스트 상자 46개, 발표자 노트 4개와 XML 구조를 확인했다. Microsoft PowerPoint UI에서의 실제 렌더링 검사는 수행하지 않았으며 글꼴 대체나 뷰어에 따른 줄바꿈 차이가 남을 수 있다.

`npm audit`는 검사 시점에 취약점 0개였다. 이것은 애플리케이션 보안 인증이나 미래 의존성 취약점 부재를 의미하지 않는다. Dockerfile과 로컬 PostgreSQL용 Compose 설정은 제공하지만 이 환경에서는 Docker 빌드를 실행하지 않았다.

## 배포 중 발견하고 수정한 문제

### PostgreSQL JSONB의 이중 직렬화

로컬 PGlite에서 통과하던 repository 테스트가 실제 PostgreSQL CI에서 실패했다. 이미 직렬화한 JSON 문자열을 `::jsonb` 파라미터로 전달하면 PostgreSQL 드라이버가 다시 직렬화해 JSONB 객체 대신 JSONB 문자열을 저장하는 것이 원인이었다.

repository의 JSON 파라미터를 `::text::jsonb`로 명시해 두 드라이버의 직렬화 경계를 일치시켰다. 초기 데이터의 슬롯·버전·슬라이드 구조를 테스트에서 직접 확인하고 PostgreSQL 17로 전체 CI를 다시 통과시켰다. 동일 SQL 스키마를 사용한다는 사실만으로 드라이버 간 동작까지 같다고 가정할 수 없다는 사례다.

### Vercel과 Docker의 빌드 산출물

Docker용 `output: "standalone"` 설정을 Vercel에도 적용한 첫 배포는 `.next/next-server.js.nft.json`을 찾지 못해 실패했다. Vercel에서는 플랫폼이 Next.js 산출물을 패키징하도록 두고, 로컬·Docker에서만 standalone을 사용하게 변경했다. 수정 후 Vercel 프로덕션 배포가 준비 상태가 되었고 공개 URL에서 전체 E2E를 통과했다.

두 수정은 [`8765dec`](https://github.com/kwakhyun/slide-atlas/commit/8765decef18168bff86537aadb95ecfdd698198f)에 포함되어 있다.

## 다음 운영 검증

1. 이 프로젝트 전용 PostgreSQL을 연결하고 `DATABASE_URL`을 서버 환경 변수로 설정한다. 공개 모드가 `postgres`로 전환되었는지 확인하고, 재배포 전후에 같은 세션의 저장 데이터가 유지되는지 검증한다.
2. 실제 OpenAI 사용 승인이 있을 때 서버 전용 키·활성화 플래그·초대 코드·일별 예산을 설정한다. 비민감 입력으로 품질·지연 시간·토큰 비용을 따로 측정한다.
3. 작성자와 분리된 검증셋과 실제 운영자 관찰로 실패 유형 및 작업 시간을 측정한다. 현재 합성 개발 평가의 개선 수치를 사용자 성과로 해석하지 않는다.

현재 외부 DB 생성·연결과 실제 API 키 설정은 완료되지 않았다. 기존의 다른 프로젝트 데이터베이스나 자격 증명은 재사용하지 않았다.
