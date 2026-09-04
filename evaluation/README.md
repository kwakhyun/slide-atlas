# 독립 검색 홀드아웃 평가

현재 공개된 24개 질의는 구현자가 검색 규칙을 조정하며 사용한 개발셋입니다. 독립 성능 근거로 다시 사용하지 않습니다.

## 평가자에게 전달할 작업

1. [`holdout-catalog.json`](holdout-catalog.json)에서 평가할 템플릿의 이름, 설명, 구조와 ID를 확인합니다. 검색 결과와 구현 코드는 보지 않습니다.
2. `holdout.template.json`을 복사해 `holdout.completed.json`으로 저장합니다.
3. 기존 `docs/evaluation.json`을 보지 않은 상태에서 실제 검색 표현을 24개 이상 작성합니다.
4. 각 질의에 적합한 템플릿 ID를 하나 이상 표시합니다. 정답은 결과 순위를 보기 전에 고정합니다.
5. `status`를 `completed`로 바꾸고 평가자 정보와 완료 시각을 기록합니다.
6. 다음 명령으로 결과를 생성합니다.

```bash
npm run eval:holdout -- --dataset evaluation/holdout.completed.json --output docs/holdout-evaluation.json
```

스크립트는 완료 상태, 최소 표본 수, 평가자의 구현 독립성 선언, 중복 케이스와 존재하지 않는 템플릿 ID를 검사합니다. 독립 평가가 끝나기 전에는 README에 홀드아웃 점수를 표시하지 않습니다.

템플릿이 바뀌면 `npm run eval:holdout:catalog`으로 평가자용 목록을 다시 만들고 변경 내용을 검토합니다. CI에서는 `npm run eval:holdout:catalog -- --check`로 목록과 현재 카탈로그가 같은지 확인할 수 있습니다.
