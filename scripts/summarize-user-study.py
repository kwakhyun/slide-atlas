"""Summarize completed observer CSVs; never substitute missing observations."""

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import date
from pathlib import Path
from statistics import median


COUNT_FIELDS = (
    "duration_seconds", "error_count", "backtrack_count", "hint_count", "edit_count"
)
RATING_FIELDS = (
    "structure_understanding_1_to_5", "status_understanding_1_to_5",
    "quality_warning_understanding_1_to_5",
)
REQUIRED_FIELDS = (
    "participant_id", "experience", "task_id", "success_without_help",
    "facilitator_intervention", "blocked_stage", "observation",
    *COUNT_FIELDS, *RATING_FIELDS,
)


def summarize(source: Path, study_date: str, recruitment: str) -> dict:
    date.fromisoformat(study_date)
    if not recruitment.strip():
        raise ValueError("모집 기준을 입력해 주세요.")
    with source.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = set(REQUIRED_FIELDS) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"누락된 열: {', '.join(sorted(missing))}")
        rows = list(reader)
    if not rows:
        raise ValueError("실제 관찰 기록이 필요합니다.")
    seen = set()
    for row in rows:
        if None in row:
            raise ValueError("열 수가 맞지 않습니다. 쉼표가 있는 메모는 따옴표로 감싸 주세요.")
        for field in REQUIRED_FIELDS:
            row[field] = (row[field] or "").strip()
            if not row[field] or row[field] == "replace_me":
                raise ValueError(f"미완성 기록: {field}. 빈칸을 0이나 성공으로 간주하지 않습니다.")
        task = int(row["task_id"])
        key = (row["participant_id"], task)
        if task not in range(1, 6) or key in seen:
            raise ValueError("과제는 1~5여야 하며 참여자별로 중복될 수 없습니다.")
        seen.add(key)
        row["task_id"] = task
        for field in COUNT_FIELDS:
            value = int(row[field])
            if value < 0 or (field == "duration_seconds" and value == 0):
                raise ValueError(f"유효하지 않은 측정값: {field}")
            row[field] = value
        for field in RATING_FIELDS:
            value = int(row[field])
            if value not in range(1, 6):
                raise ValueError(f"이해도는 1~5로 기록해 주세요: {field}")
            row[field] = value
        for field in ("success_without_help", "facilitator_intervention"):
            if row[field] not in ("true", "false"):
                raise ValueError(f"{field}는 true 또는 false여야 합니다.")
            row[field] = row[field] == "true"
        if row["success_without_help"] and (row["hint_count"] or row["facilitator_intervention"]):
            raise ValueError("도움 없이 성공한 기록에 힌트 또는 진행자 개입이 있습니다.")
    participants = sorted({row["participant_id"] for row in rows})
    if any({task for person, task in seen if person == participant} != set(range(1, 6)) for participant in participants):
        raise ValueError("참여자마다 과제 1~5의 관찰 결과를 모두 기록해 주세요. 중단한 과제도 실패와 경과 시간을 남깁니다.")
    interventions = sum(row["facilitator_intervention"] for row in rows)
    tasks = []
    for task in range(1, 6):
        records = [row for row in rows if row["task_id"] == task]
        successes = sum(row["success_without_help"] for row in records)
        tasks.append({
            "taskId": task, "observations": len(records),
            "successWithoutHelp": successes, "successRate": successes / len(records),
            "medianSecondsAllAttempts": median(row["duration_seconds"] for row in records),
            "medianEdits": median(row["edit_count"] for row in records),
            "medianHints": median(row["hint_count"] for row in records),
            "errors": sum(row["error_count"] for row in records),
            "backtracks": sum(row["backtrack_count"] for row in records),
            "blockedStages": dict(Counter(row["blocked_stage"] for row in records if row["blocked_stage"] != "none")),
        })
    return {
        "protocolVersion": "atlas-user-study-v2", "studyDate": study_date,
        "recruitment": recruitment.strip(), "participants": len(participants),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "interpretation": "exploratory-only" if len(participants) < 3 or interventions > len(rows) / 2 else "small-sample-observation",
        "facilitatorInterventions": interventions, "tasks": tasks,
        "limitations": "입력 기록의 독립성은 자동 검증하지 않습니다. 실제 관찰 여부, 모집 기준과 실패 사례를 진행자가 확인해야 합니다. 전후 비교가 없으므로 작업 시간 감소를 주장할 수 없습니다.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--study-date", required=True)
    parser.add_argument("--recruitment", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = summarize(args.input, args.study_date, args.recruitment)
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")


if __name__ == "__main__":
    main()
