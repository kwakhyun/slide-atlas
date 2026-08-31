# REST API

동일 출처 `/api` 아래의 JSON API다. 성공 응답은 `{ "data": … }`, 실패는 `{ "error": { "code", "message", "requestId" } }`다. 에러 응답에 입력 본문·비밀키·stack trace를 반환하지 않는다.

세션은 최초 workspace 요청에서 HttpOnly cookie로 발급한다. 임의 workspace ID를 파라미터로 받지 않는다. 아래 리소스는 모두 서버가 세션에서 확인한 workspace에 한정된다. 쓰기 요청은 JSON, 최대 64,000 bytes이며 cross-origin 변경 요청은 거절한다.

| Method | Path                                                           | 목적                                          |
| ------ | -------------------------------------------------------------- | --------------------------------------------- |
| GET    | `/health`                                                      | DB 연결·버전·저장 모드·AI 설정 상태           |
| GET    | `/workspace`                                                   | templates/decks/events/experiments bootstrap  |
| GET    | `/templates?q=…&intent=…&layout=…&status=…&slots=…&strategy=…` | 검색 결과, 점수, 이유, 구성 점수              |
| GET    | `/templates/:id`                                               | 단일 온톨로지                                 |
| POST   | `/templates`                                                   | Zod 계약에 맞는 template를 초안으로 등록      |
| PATCH  | `/templates/:id`                                               | `{template, expectedVersion}`; 수정 후 초안   |
| POST   | `/templates/:id/review`                                        | `{status, expectedVersion, note}`             |
| POST   | `/decks`                                                       | `{brief, count: 1..6, theme, provider}`       |
| GET    | `/decks/:id`                                                   | 프레젠테이션                                  |
| PATCH  | `/decks/:id`                                                   | `{title, slides, expectedVersion}`; 1..12장   |
| GET    | `/decks/:id/export?format=pptx\|svg\|json&slide=0`             | attachment; SVG는 지정된 한 장                |
| POST   | `/experiments`                                                 | 현재 승인 카탈로그의 고정 검색 평가 실행·저장 |

`provider`는 `deterministic` 또는 `openai`. AI 경로는 서버 설정 외에도 `X-AI-Access-Code`를 요구한다. template JSON 계약은 [domain.ts](../src/lib/domain.ts), 실제 예시는 [catalog.ts](../src/lib/catalog.ts)를 참고한다. JSON 가져오기는 `.pptx`/`.pdf` 파싱 기능이 아니다.

## 실패 계약

| HTTP      | 예시 코드                                            | 의미                                |
| --------- | ---------------------------------------------------- | ----------------------------------- |
| 400       | `INVALID_JSON`                                       | 파싱 불가능한 JSON                  |
| 403       | `ORIGIN_DENIED`, `AI_ACCESS_DENIED`                  | 출처·AI 초대 코드 거절              |
| 404       | `NOT_FOUND`                                          | 없는 리소스 또는 다른 세션의 리소스 |
| 409       | `VERSION_CONFLICT`                                   | 최신 버전을 다시 읽어야 하는 충돌   |
| 413 / 415 | `BODY_TOO_LARGE`, `JSON_REQUIRED`                    | 입력 크기·형식 제한                 |
| 422       | `VALIDATION`, `INVALID_TRANSITION`, `QUALITY_FAILED` | 데이터 계약·상태·품질 위반          |
| 429       | `RATE_LIMIT`, `AI_DAILY_LIMIT`                       | 분당 또는 일별 예산 초과            |
| 502 / 503 | AI 관련 명시적 코드                                  | 모델 오류 또는 비활성화             |

응답은 private/no-store다. 일반 쓰기는 세션당 60회/분, 생성은 8회/분, 실험은 5회/분으로 제한한다. `Retry-After: 60`은 분당 제한에 대한 보수적인 재시도 안내다. 일일 AI 한도의 `Retry-After`는 다음 UTC 일자까지 남은 초를 반환한다.
