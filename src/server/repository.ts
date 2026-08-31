import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  SEED_TEMPLATES,
  EXAMPLE_BRIEF,
  SAMPLE_DECK_SLIDES,
} from "@/lib/catalog";
import {
  templateInputSchema,
  type SlideTemplate,
  type TemplateInput,
  type TemplateStatus,
  type Deck,
  type Experiment,
  type AuditEvent,
  type WorkspaceState,
} from "@/lib/domain";
import type { Database, DbSession } from "./database";
import { invariant } from "./errors";
import { checkSlide } from "@/lib/quality";
import { isAiConfigured } from "./ai";

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const searchText = (t: TemplateInput) =>
  `${t.name} ${t.description} ${t.tags.join(" ")} ${t.intent} ${t.layout}`;

export async function appendEvent(
  db: DbSession,
  workspaceId: string,
  entityType: AuditEvent["entityType"],
  entityId: string,
  action: string,
  detail: string,
) {
  await db.query(
    "INSERT INTO audit_events (id,workspace_id,entity_type,entity_id,action,detail) VALUES ($1,$2,$3,$4,$5,$6)",
    [randomUUID(), workspaceId, entityType, entityId, action, detail],
  );
}
export async function createWorkspace(
  db: Database,
  token = randomBytes(32).toString("base64url"),
): Promise<{ workspaceId: string; token: string }> {
  const workspaceId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO workspaces (id,session_hash) VALUES ($1,$2)", [
      workspaceId,
      hash(token),
    ]);
    for (const t of SEED_TEMPLATES)
      await tx.query(
        "INSERT INTO templates (workspace_id,id,name,intent,layout,status,version,search_text,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        [
          workspaceId,
          t.id,
          t.name,
          t.intent,
          t.layout,
          t.status,
          t.version,
          searchText(t),
          JSON.stringify(t),
        ],
      );
    const now = new Date().toISOString();
    const deck: Deck = {
      id: "sample-deck",
      title: "더 적은 반복, 더 많은 가능성",
      brief: EXAMPLE_BRIEF,
      slides: SAMPLE_DECK_SLIDES,
      version: 1,
      provider: "deterministic",
      createdAt: now,
      updatedAt: now,
    };
    await tx.query(
      "INSERT INTO decks (workspace_id,id,data) VALUES ($1,$2,$3::jsonb)",
      [workspaceId, deck.id, JSON.stringify(deck)],
    );
    await appendEvent(
      tx,
      workspaceId,
      "template",
      "catalog",
      "workspace.created",
      "독립 데모 공간에 직접 제작한 18개 템플릿과 예시 프레젠테이션을 준비했습니다.",
    );
  });
  return { workspaceId, token };
}
export async function resolveWorkspace(
  db: Database,
  token?: string,
): Promise<{ workspaceId: string; newToken?: string }> {
  if (token && /^[\w-]{43}$/.test(token)) {
    const result = await db.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE session_hash=$1 AND created_at > NOW() - INTERVAL '7 days'",
      [hash(token)],
    );
    if (result.rows[0]) return { workspaceId: result.rows[0].id };
  }
  await db.query(
    "DELETE FROM workspaces WHERE created_at < NOW() - INTERVAL '7 days'",
  );
  const count = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM workspaces",
  );
  invariant(
    Number(count.rows[0].count) < 1000,
    503,
    "DEMO_CAPACITY",
    "데모 공간이 잠시 가득 찼습니다. 잠시 후 다시 시도해 주세요.",
  );
  const created = await createWorkspace(db);
  return { workspaceId: created.workspaceId, newToken: created.token };
}
export async function rateLimit(
  db: Database,
  workspaceId: string,
  bucket: string,
  limit: number,
  now = Date.now(),
) {
  const start = Math.floor(now / 60000);
  const result = await db.query<{ count: number }>(
    `INSERT INTO rate_windows(workspace_id,bucket,window_start,count) VALUES($1,$2,$3,1)
    ON CONFLICT(workspace_id,bucket) DO UPDATE SET count=CASE WHEN rate_windows.window_start=EXCLUDED.window_start THEN rate_windows.count+1 ELSE 1 END, window_start=EXCLUDED.window_start RETURNING count`,
    [workspaceId, bucket, start],
  );
  invariant(
    result.rows[0].count <= limit,
    429,
    "RATE_LIMIT",
    "요청이 많습니다. 1분 뒤에 다시 시도해 주세요.",
  );
}
export async function listTemplates(
  db: DbSession,
  workspaceId: string,
): Promise<SlideTemplate[]> {
  const { rows } = await db.query<{ data: SlideTemplate }>(
    "SELECT data FROM templates WHERE workspace_id=$1 ORDER BY id",
    [workspaceId],
  );
  return rows.map((r) => r.data);
}
export async function getTemplate(
  db: DbSession,
  workspaceId: string,
  id: string,
  lock = false,
): Promise<SlideTemplate> {
  const { rows } = await db.query<{ data: SlideTemplate }>(
    `SELECT data FROM templates WHERE workspace_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, id],
  );
  invariant(rows[0], 404, "NOT_FOUND", "템플릿을 찾을 수 없습니다.");
  return rows[0].data;
}
async function writeTemplate(
  tx: DbSession,
  workspaceId: string,
  t: SlideTemplate,
) {
  await tx.query(
    "UPDATE templates SET name=$3,intent=$4,layout=$5,status=$6,version=$7,search_text=$8,data=$9::jsonb,updated_at=NOW() WHERE workspace_id=$1 AND id=$2",
    [
      workspaceId,
      t.id,
      t.name,
      t.intent,
      t.layout,
      t.status,
      t.version,
      searchText(t),
      JSON.stringify(t),
    ],
  );
}
export async function insertTemplate(
  db: Database,
  workspaceId: string,
  input: TemplateInput,
): Promise<SlideTemplate> {
  const valid = templateInputSchema.parse(input);
  const t: SlideTemplate = {
    ...valid,
    id: randomUUID(),
    version: 1,
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    const count = await tx.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM templates WHERE workspace_id=$1",
      [workspaceId],
    );
    invariant(
      Number(count.rows[0].count) < 100,
      422,
      "LIMIT",
      "데모에서는 템플릿을 100개까지 등록할 수 있습니다.",
    );
    await tx.query(
      "INSERT INTO templates (workspace_id,id,name,intent,layout,status,version,search_text,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
      [
        workspaceId,
        t.id,
        t.name,
        t.intent,
        t.layout,
        t.status,
        t.version,
        searchText(t),
        JSON.stringify(t),
      ],
    );
    await appendEvent(
      tx,
      workspaceId,
      "template",
      t.id,
      "template.created",
      `“${t.name}” 초안 등록 · 슬롯 ${t.slots.length}개`,
    );
  });
  return t;
}
export async function updateTemplate(
  db: Database,
  workspaceId: string,
  id: string,
  input: TemplateInput,
  expectedVersion: number,
): Promise<SlideTemplate> {
  const valid = templateInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const current = await getTemplate(tx, workspaceId, id, true);
    invariant(
      current.version === expectedVersion,
      409,
      "VERSION_CONFLICT",
      "다른 작업에서 템플릿이 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
    );
    const next: SlideTemplate = {
      ...valid,
      id,
      version: current.version + 1,
      status: "draft",
      updatedAt: new Date().toISOString(),
    };
    await writeTemplate(tx, workspaceId, next);
    await appendEvent(
      tx,
      workspaceId,
      "template",
      id,
      "template.updated",
      `“${next.name}” v${current.version} → v${next.version} · 수정 후 재승인 필요`,
    );
    return next;
  });
}
const transitions: Record<TemplateStatus, TemplateStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: [],
  rejected: ["in_review"],
};
export async function reviewTemplate(
  db: Database,
  workspaceId: string,
  id: string,
  status: TemplateStatus,
  expectedVersion: number,
  note: string,
): Promise<SlideTemplate> {
  return db.transaction(async (tx) => {
    const current = await getTemplate(tx, workspaceId, id, true);
    invariant(
      current.version === expectedVersion,
      409,
      "VERSION_CONFLICT",
      "검수 중 템플릿이 변경되었습니다. 새로고침해 주세요.",
    );
    invariant(
      transitions[current.status].includes(status),
      422,
      "INVALID_TRANSITION",
      "허용되지 않는 검수 상태 변경입니다.",
    );
    if (status === "approved") {
      templateInputSchema.parse(current);
      const quality = checkSlide(
        {
          id,
          templateId: id,
          templateVersion: current.version,
          values: current.sampleContent,
          theme: current.defaultTheme,
        },
        current,
        Object.values(current.sampleContent).join(" "),
      );
      invariant(
        quality.errors === 0,
        422,
        "QUALITY_FAILED",
        "필수 내용·대비·슬롯 오류를 해결한 뒤 승인해 주세요.",
      );
    }
    invariant(
      note.trim().length >= 5,
      422,
      "REVIEW_NOTE_REQUIRED",
      "검수 근거를 5자 이상 남겨 주세요.",
    );
    const next = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await writeTemplate(tx, workspaceId, next);
    await appendEvent(
      tx,
      workspaceId,
      "template",
      id,
      `review.${status}`,
      `“${next.name}” · ${note.trim()}`,
    );
    return next;
  });
}
export async function getDeck(
  db: DbSession,
  workspaceId: string,
  id: string,
  lock = false,
): Promise<Deck> {
  const { rows } = await db.query<{ data: Deck }>(
    `SELECT data FROM decks WHERE workspace_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
    [workspaceId, id],
  );
  invariant(rows[0], 404, "NOT_FOUND", "프레젠테이션을 찾을 수 없습니다.");
  return rows[0].data;
}
export async function insertDeck(
  db: Database,
  workspaceId: string,
  deck: Deck,
) {
  await db.transaction(async (tx) => {
    const count = await tx.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM decks WHERE workspace_id=$1",
      [workspaceId],
    );
    invariant(
      Number(count.rows[0].count) < 50,
      422,
      "LIMIT",
      "데모에서는 프레젠테이션을 50개까지 저장할 수 있습니다.",
    );
    await tx.query(
      "INSERT INTO decks(workspace_id,id,version,data) VALUES($1,$2,$3,$4::jsonb)",
      [workspaceId, deck.id, deck.version, JSON.stringify(deck)],
    );
    await appendEvent(
      tx,
      workspaceId,
      "deck",
      deck.id,
      "deck.generated",
      `“${deck.title}” ${deck.slides.length}장 생성 · ${deck.provider === "openai" ? "OpenAI" : "규칙 기반"}`,
    );
  });
}
export async function updateDeck(
  db: Database,
  workspaceId: string,
  id: string,
  changes: Pick<Deck, "title" | "slides">,
  expectedVersion: number,
): Promise<Deck> {
  return db.transaction(async (tx) => {
    const current = await getDeck(tx, workspaceId, id, true);
    invariant(
      current.version === expectedVersion,
      409,
      "VERSION_CONFLICT",
      "프레젠테이션의 최신 버전을 다시 불러와 주세요.",
    );
    for (const slide of changes.slides) {
      const template = await getTemplate(tx, workspaceId, slide.templateId);
      invariant(
        Object.keys(slide.values).every((k) =>
          template.slots.some((s) => s.key === k),
        ),
        422,
        "INVALID_SLOT",
        "템플릿에 정의되지 않은 슬롯입니다.",
      );
    }
    const next = {
      ...current,
      ...changes,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await tx.query(
      "UPDATE decks SET version=$3,data=$4::jsonb,updated_at=NOW() WHERE workspace_id=$1 AND id=$2",
      [workspaceId, id, next.version, JSON.stringify(next)],
    );
    await appendEvent(
      tx,
      workspaceId,
      "deck",
      id,
      "deck.updated",
      `“${next.title}” 내용·스타일 저장 · v${next.version}`,
    );
    return next;
  });
}
export async function insertExperiment(
  db: Database,
  workspaceId: string,
  experiment: Experiment,
) {
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO experiments(workspace_id,id,data) VALUES($1,$2,$3::jsonb)",
      [workspaceId, experiment.id, JSON.stringify(experiment)],
    );
    await tx.query(
      "DELETE FROM experiments WHERE workspace_id=$1 AND id NOT IN (SELECT id FROM experiments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 20)",
      [workspaceId],
    );
    await appendEvent(
      tx,
      workspaceId,
      "experiment",
      experiment.id,
      "experiment.completed",
      `${experiment.size}개 고정 질의 · 구조 검색 Hit@1 ${(experiment.structure.hitAt1 * 100).toFixed(1)}% · 개발용 합성 평가셋`,
    );
  });
}
export async function getWorkspaceState(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceState> {
  const [templates, decks, events, experiments] = await Promise.all([
    listTemplates(db, workspaceId),
    db.query<{ data: Deck }>(
      "SELECT data FROM decks WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 50",
      [workspaceId],
    ),
    db.query<{
      id: string;
      entity_type: AuditEvent["entityType"];
      entity_id: string;
      action: string;
      detail: string;
      created_at: Date | string;
    }>(
      "SELECT id,entity_type,entity_id,action,detail,created_at FROM audit_events WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 100",
      [workspaceId],
    ),
    db.query<{ data: Experiment }>(
      "SELECT data FROM experiments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 20",
      [workspaceId],
    ),
  ]);
  return {
    templates,
    decks: decks.rows.map((r) => r.data),
    events: events.rows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      detail: r.detail,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    experiments: experiments.rows.map((r) => r.data),
    storage: db.mode,
    aiAvailable: isAiConfigured(),
  };
}
