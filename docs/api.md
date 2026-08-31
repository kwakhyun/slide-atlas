# REST API

서비스와 같은 출처의 `/api` 경로에서 제공하는 JSON API입니다. 성공 응답은 `{ "data": … }`, 오류 응답은 `{ "error": { "code", "message", "requestId" } }` 형식을 사용합니다. 오류 응답에 입력 본문, 비밀키, 스택 트레이스를 포함하지 않습니다.

첫 `/workspace` 요청에서 HttpOnly 쿠키로 세션을 발급합니다. 요청자가 임의의 작업 공간 ID를 지정할 수 없으며, 아래 데이터는 모두 서버가 세션에서 확인한 작업 공간에 속합니다. 데이터 변경 요청은 최대 64,000바이트의 JSON만 허용하고, 다른 출처에서 보내는 변경 요청은 거절합니다.

| Method | Path                                                           | 목적                                              |
| ------ | -------------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/health`                                                      | DB 연결·버전·저장 모드·AI 설정 상태               |
| GET    | `/workspace`                                                   | 템플릿·프레젠테이션·감사 이력·실험 기록 초기 조회 |
| GET    | `/templates?q=…&intent=…&layout=…&status=…&slots=…&strategy=…` | 검색 결과, 점수, 이유, 구성 점수                  |
| GET    | `/templates/:id`                                               | 템플릿 한 건 조회                                 |
| POST   | `/templates`                                                   | Zod 스키마를 검증한 템플릿을 초안으로 등록        |
| PATCH  | `/templates/:id`                                               | `{template, expectedVersion}`; 수정 후 초안       |
| POST   | `/templates/:id/review`                                        | `{status, expectedVersion, note}`                 |
| POST   | `/decks`                                                       | `{brief, count: 1..6, theme, provider}`           |
| GET    | `/decks/:id`                                                   | 프레젠테이션                                      |
| PATCH  | `/decks/:id`                                                   | `{title, slides, expectedVersion}`; 1..12장       |
| GET    | `/decks/:id/export?format=pptx\|svg\|json&slide=0`             | 첨부 파일로 내보내기; SVG는 지정한 한 장          |
| POST   | `/experiments`                                                 | 현재 승인 카탈로그의 고정 검색 평가 실행·저장     |

`provider`에는 `deterministic` 또는 `openai`를 지정합니다. OpenAI를 사용하려면 서버 설정과 함께 `X-AI-Access-Code` 헤더가 필요합니다. 템플릿 JSON 구조는 [domain.ts](../src/lib/domain.ts), 예시 데이터는 [catalog.ts](../src/lib/catalog.ts)를 참고해 주세요. JSON 가져오기는 온톨로지 데이터 등록용이며 `.pptx`나 `.pdf` 파일을 분석하는 기능은 아닙니다.

## 오류 응답

| HTTP      | 예시 코드                                            | 의미                                 |
| --------- | ---------------------------------------------------- | ------------------------------------ |
| 400       | `INVALID_JSON`                                       | 파싱 불가능한 JSON                   |
| 403       | `ORIGIN_DENIED`, `AI_ACCESS_DENIED`                  | 출처·AI 초대 코드 거절               |
| 404       | `NOT_FOUND`                                          | 없는 리소스 또는 다른 세션의 리소스  |
| 409       | `VERSION_CONFLICT`                                   | 최신 버전을 다시 읽어야 하는 충돌    |
| 413 / 415 | `BODY_TOO_LARGE`, `JSON_REQUIRED`                    | 입력 크기·형식 제한                  |
| 422       | `VALIDATION`, `INVALID_TRANSITION`, `QUALITY_FAILED` | 데이터 구조·상태 전이·품질 규칙 위반 |
| 429       | `RATE_LIMIT`, `AI_DAILY_LIMIT`                       | 분당 또는 일별 예산 초과             |
| 502 / 503 | AI 관련 명시적 코드                                  | 모델 오류 또는 비활성화              |

응답에는 `private, no-store` 캐시 정책을 적용합니다. 세션당 일반 데이터 변경은 분당 60회, 생성은 8회, 실험은 5회로 제한합니다. 분당 제한을 초과하면 `Retry-After: 60`으로 재시도 대기 시간을 안내합니다. AI 일일 한도를 초과한 경우에는 다음 UTC 날짜까지 남은 시간을 초 단위로 반환합니다.
