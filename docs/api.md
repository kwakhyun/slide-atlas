# REST API

서비스의 `/api` 경로에서 JSON API를 제공합니다. 성공 응답은 `{ "data": … }`, 오류 응답은 `{ "error": { "code", "message", "requestId" } }` 형식을 사용합니다. 오류 응답에 입력 본문, 비밀키, 스택 트레이스를 포함하지 않습니다.

첫 `/workspace` 요청에서 HttpOnly 쿠키로 세션을 발급합니다. 요청자가 임의의 작업 공간 ID를 지정할 수 없으며, 작업 공간 API는 서버가 세션에서 확인한 데이터만 반환합니다. `/shared/:token`은 별도로 유효한 공유 토큰을 확인해 읽기 전용 사본을 반환합니다. JSON 요청 본문은 최대 64,000바이트로 제한하고, 다른 출처에서 보내는 변경 요청은 거절합니다.

| Method | Path                                                                                    | 목적                                                               |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/health`                                                                               | DB 연결, 버전, 저장 모드와 AI 설정 상태                            |
| GET    | `/workspace`                                                                            | 템플릿, 프레젠테이션, 감사, 실험과 AI 일일 사용량 조회             |
| GET    | `/templates?q=…&intent=…&layout=…&status=…&slots=…&strategy=…&sort=…&page=…&pageSize=…` | 검색 결과, 점수, 이유, 구성 점수와 페이지 정보                     |
| GET    | `/templates/:id`                                                                        | 템플릿 한 건 조회                                                  |
| GET    | `/templates/:id/versions`                                                               | 최근 템플릿 버전 스냅샷 20개 조회                                  |
| POST   | `/templates`                                                                            | Zod 스키마를 검증한 템플릿을 초안으로 등록                         |
| POST   | `/templates/extract`                                                                    | 8MB 이하 PPTX에서 최대 12장의 온톨로지 후보 추출                   |
| PATCH  | `/templates/:id`                                                                        | `{template, expectedVersion}`; 수정 후 초안                        |
| POST   | `/templates/:id/review`                                                                 | `{status, expectedVersion, note}`                                  |
| POST   | `/decks`                                                                                | `{brief, count: 1..6, theme, provider}`                            |
| GET    | `/decks/:id`                                                                            | 프레젠테이션                                                       |
| PATCH  | `/decks/:id`                                                                            | `{title, slides, expectedVersion}`; 1..12장                        |
| POST   | `/decks/:id/duplicate`                                                                  | 슬라이드 ID를 새로 발급하여 프레젠테이션 복제                      |
| DELETE | `/decks/:id`                                                                            | 프레젠테이션 삭제; 마지막 한 건은 삭제할 수 없음                   |
| GET    | `/decks/:id/export?format=pptx\|svg\|json&slide=0`                                      | 첨부 파일로 내보내기; SVG는 지정한 한 장                           |
| GET    | `/workspace?view=core`                                                                  | 초기 편집 데이터 조회; 감사 이력과 실험 조회 제외                  |
| GET    | `/events`                                                                               | 최근 감사 이력 100건 조회                                          |
| GET    | `/experiments`                                                                          | 최근 실험 20건 조회                                                |
| POST   | `/experiments`                                                                          | 현재 승인 카탈로그의 기본 또는 저장된 설정으로 검색 평가 실행·저장 |

`provider`에는 `deterministic` 또는 `openai`를 지정합니다. OpenAI를 사용하려면 서버 설정과 함께 `X-AI-Access-Code` 헤더가 필요합니다. 템플릿 JSON 구조는 [domain.ts](../src/lib/domain.ts), 예시 데이터는 [catalog.ts](../src/lib/catalog.ts)를 참고해 주세요.

`GET /templates`의 `page`는 1부터, `pageSize`는 1~50이며 기본값은 각각 1과 24입니다. `sort`는 `relevance`, `updated`, `name` 중 하나입니다. 성공 응답의 `data`는 `{ items, page, pageSize, total, hasNext }` 형태입니다. DB에서 세션 범위, 필터와 텍스트 후보를 먼저 제한하고 구조 점수와 정렬을 적용한 뒤 해당 페이지만 반환합니다.

`POST /templates/extract`는 `multipart/form-data`의 `file` 필드로 `.pptx` 하나를 받습니다. 파일 크기, ZIP 항목 수, 암호화 여부와 압축 해제 예상 크기를 검사한 뒤 텍스트, 좌표와 글자 크기를 슬라이드별 `TemplateInput` 후보로 반환합니다. 분석만으로 템플릿을 저장하지 않으며 이미지, 표와 차트는 경고와 함께 제외합니다. `.pdf`는 지원하지 않습니다.

OpenAI 생성이 활성화된 환경에서 초대 코드가 없거나 일치하지 않으면 모델 호출 전에 `403 AI_ACCESS_DENIED`를 반환합니다. 성공한 프레젠테이션의 `generation`에는 `model`, `promptVersion`, `durationMs`, `inputTokens`, `outputTokens`를 기록합니다. 실제 모델 API 키를 요청 본문이나 이 헤더에 넣으시면 안 됩니다.

템플릿을 등록·수정·검수할 때마다 `template_versions`에 변경 불가능한 JSONB 스냅샷을 저장합니다. 검수 화면은 상태만 바뀐 버전을 건너뛰고 실제 내용이 달라진 이전 버전과 비교합니다. 프레젠테이션 복제 시에는 원본과 분리된 새 프레젠테이션 ID와 슬라이드 ID를 발급하며, 삭제 후에도 감사 이벤트는 유지합니다.

`GET /workspace`는 현재 카탈로그인 `templates`와 별도로 덱이 참조한 버전 사본 배열 `templateVersions`를 반환합니다. 같은 템플릿 ID에 여러 버전이 있을 수 있으므로 클라이언트는 ID와 버전을 함께 비교해야 합니다. SVG, PPTX와 JSON 내보내기도 이 사본을 사용하며 JSON의 `templates`에는 실제 사용한 버전만 포함됩니다. `PATCH /decks/:id`는 전달받은 각 `templateVersion`이 해당 작업 공간에 존재하고 승인된 사본인지 확인한 뒤 그 버전의 슬롯으로 검증합니다.

## 화면별 조회

- `GET /workspace?view=core`: 초기 편집에 필요한 카탈로그, 덱, 참조 버전과 실행 설정을 반환합니다. `events`, `experiments`는 빈 배열이며 해당 테이블을 조회하지 않습니다. 매개변수 없는 `GET /workspace`의 전체 응답은 유지합니다.
- `GET /events`: 현재 세션의 최근 감사 이력 100건을 반환합니다. UI는 검수 이력 모달을 열 때 조회합니다.
- `GET /experiments`: 현재 세션의 최근 실험 20건을 반환합니다. UI는 작업 공간 쿠키 초기화 후 실험실에서 조회합니다.

저장 클라이언트는 `PATCH /decks/:id`의 성공 응답에 포함된 새 버전으로 편집 상태를 갱신해야 합니다. 후속 전체 조회 성공 여부를 저장 성공 조건으로 사용하지 않습니다. 실제 동시 편집에 따른 `409 VERSION_CONFLICT` 처리와 복구 JSON 제공은 유지합니다.

## 오류 응답

| HTTP      | 예시 코드                                                                                                                 | 의미                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 400       | `INVALID_JSON`                                                                                                            | 파싱 불가능한 JSON                                    |
| 403       | `ORIGIN_DENIED`, `AI_ACCESS_DENIED`                                                                                       | 출처·AI 초대 코드 거절                                |
| 404       | `NOT_FOUND`                                                                                                               | 없는 리소스 또는 다른 세션의 리소스                   |
| 409       | `VERSION_CONFLICT`                                                                                                        | 최신 버전을 다시 읽어야 하는 충돌                     |
| 413 / 415 | `BODY_TOO_LARGE`, `JSON_REQUIRED`, `PPTX_SIZE_LIMIT`, `PPTX_REQUIRED`                                                     | 입력 크기·형식 제한                                   |
| 422       | `VALIDATION`, `INVALID_TRANSITION`, `QUALITY_FAILED`, `INVALID_PPTX`, `TEMPLATE_VERSION_MISSING`, `TEMPLATE_NOT_APPROVED` | 데이터 구조, 상태 전이, 품질 규칙 또는 파일 구조 위반 |
| 429       | `RATE_LIMIT`, `AI_DAILY_LIMIT`                                                                                            | 분당 또는 일별 예산 초과                              |
| 502 / 503 | AI 관련 명시적 코드                                                                                                       | 모델 오류 또는 비활성화                               |

응답에는 `private, no-store` 캐시 정책을 적용합니다. 세션당 일반 데이터 변경은 분당 60회, 생성은 8회, 실험은 5회로 제한합니다. 분당 제한을 초과하면 `Retry-After: 60`으로 재시도 대기 시간을 안내합니다. AI 일일 한도를 초과한 경우에는 다음 UTC 날짜까지 남은 시간을 초 단위로 반환합니다.

## 고도화 API

| Method              | Path                    | 용도                                                                                                      |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| POST                | `/decks/:id/regenerate` | `{requestId, expectedVersion, slideId, slot?, provider}`로 부분 재생성 후보 요청. 덱을 직접 수정하지 않음 |
| GET / POST          | `/templates/:id/impact` | 승인 버전의 영향 비교 / `{templateVersion, decks: [{id, expectedVersion}]}` 선택 적용                     |
| GET / POST          | `/experiment-configs`   | 불변 실험 설정 사본 목록 / `{name, cases, weights}` 저장                                                  |
| POST                | `/experiments`          | `{configId}`가 있으면 저장된 설정 사용, 본문이 없으면 기존 개발셋 실행                                    |
| GET / POST          | `/brands`               | 브랜드 버전 목록 / `{brand: {name, font, tokens}, id?, expectedVersion?}` 새 버전 저장                    |
| GET / POST          | `/account`              | 계정과 소속 공간 확인 / `register`, `login`, `logout`, `switch`, `password` 작업                          |
| GET / POST          | `/team`                 | 현재 팀 구성원 확인 / `invite`, `join`, `remove` 작업                                                     |
| GET / POST / PATCH  | `/decks/:id/comments`   | 검수 댓글 조회 / `{body}` 작성 / `{id, resolved}` 해결 상태 변경                                          |
| GET / POST / DELETE | `/decks/:id/shares`     | 공유 목록 / `{expectedVersion, days: 1..7}` 사본 발급 / `{id}` 공유 해제                                  |
| GET                 | `/shared/:token`        | 유효한 링크의 읽기 전용 사본. 별도 세션 쿠키 발급 없이 응답                                               |

`GET /workspace`와 core 응답에는 `workspaceId`, `role`과 로그인 상태의 `accountName`을 포함합니다. 작업 공간 ID는 식별 용도이며 권한 증명이 아닙니다. 서버는 계정 세션의 유효한 구성원 자격 또는 익명 쿠키를 기준으로 공간을 결정합니다.

계정 등록과 로그인은 `{action, username, password}`를 받습니다. 공간 전환은 `{action: "switch", workspaceId}`, 비밀번호 변경은 `{action: "password", currentPassword, password}`입니다. 비밀번호 변경 시 다른 세션을 종료합니다. 계정 이름은 영문 소문자, 숫자, `_`, `-`로 3–32자이며 비밀번호는 12–128자입니다.

초대 발급은 `{action: "invite", role: "editor" | "reviewer" | "viewer"}`, 참여는 `{action: "join", code}`, 구성원 권한 해제는 `{action: "remove", accountId}`입니다. 소유자만 초대와 권한 해제를 할 수 있습니다. 초대 코드는 24시간 유효하며 한 번만 사용할 수 있습니다.

계정 세션이 만료되거나 구성원 권한이 해제되면 `401 SESSION_EXPIRED`, 역할이 부족하면 `403 ROLE_DENIED`를 반환합니다. 재생성 요청 ID의 입력이 다르면 `409 REQUEST_MISMATCH`, 처리 중이거나 실패한 같은 요청은 `409 REQUEST_PENDING`을 반환합니다. 브랜드 저장 시 대비 조건을 만족하지 않으면 `422 LOW_CONTRAST`입니다.

템플릿 일괄 적용은 항목별 `{id, ok, message}` 배열을 반환합니다. 일부 실패가 있어도 성공한 프레젠테이션의 변경은 유지하며, 실패한 항목은 다시 영향을 확인해야 합니다. 계정별 기능 범위와 데이터 보관 정책은 [기능 고도화 기록](feature-upgrades-2026-09-05.md)을 참고하세요.
