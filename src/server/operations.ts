import { canonicalJson } from "@/lib/canonical-json";
import { createHash, randomUUID } from "node:crypto";
import {
  operationInputSchema,
  type Operation,
  type OperationItem,
  type OperationInput,
} from "@/lib/operations";
import {
  templateInputSchema,
  generationInputSchema,
  type Deck,
} from "@/lib/domain";
import { templateImpact } from "@/lib/template-impact";
import { buildDeterministicDeck } from "@/lib/generate";
import {
  getDeck,
  getDeckTemplates,
  getTemplate,
  insertTemplate,
  updateDeck,
  insertDeck,
  listTemplates,
  rateLimit,
  appendEvent,
} from "./repository";
import { adaptDeckWithOpenAi, authorizeAi } from "./ai";
import { invariant } from "./errors";
import type { Database, DbSession } from "./database";
const atomicDb = (db: Database, tx: DbSession): Database => ({
  ...db,
  query: tx.query.bind(tx),
  transaction: (callback) => callback(tx),
});
export async function createOperation(
  db: Database,
  w: string,
  input: OperationInput,
) {
  const data = operationInputSchema.parse(input),
    fingerprint = createHash("sha256")
      .update(canonicalJson(data))
      .digest("hex");
  const items: OperationItem[] =
    data.kind === "import"
      ? data.templates.map((template) => ({
          label: template.name,
          input: template,
          status: "pending",
        }))
      : data.kind === "generate"
        ? [{ label: "슬라이드 생성", input: data.input, status: "pending" }]
        : data.decks.map((deck) => ({
            label: deck.id,
            input: {
              ...deck,
              templateId: data.templateId,
              templateVersion: data.templateVersion,
            },
            status: "pending",
          }));
  invariant(
    data.kind !== "impact" ||
      new Set(data.decks.map((d) => d.id)).size === data.decks.length,
    422,
    "DUPLICATE_DECK",
    "중복 프레젠테이션을 제외해 주세요.",
  );
  await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [w]);
    const previous = (
      await tx.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM operations WHERE workspace_id=$1 AND id=$2",
        [w, data.id],
      )
    ).rows[0];
    if (previous) {
      invariant(
        previous.fingerprint === fingerprint,
        409,
        "REQUEST_MISMATCH",
        "같은 작업 ID의 입력이 다릅니다.",
      );
      return;
    }
    const count = (
      await tx.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM operations WHERE workspace_id=$1",
        [w],
      )
    ).rows[0].count;
    invariant(
      count < 100,
      422,
      "LIMIT",
      "작업 기록은 공간당 100개까지 보관합니다.",
    );
    await tx.query(
      "INSERT INTO operations(workspace_id,id,fingerprint,kind,status,items) VALUES($1,$2,$3,$4,'queued',$5::text::jsonb)",
      [w, data.id, fingerprint, data.kind, JSON.stringify(items)],
    );
  });
  return getOperation(db, w, data.id);
}
export async function getOperation(
  db: DbSession,
  w: string,
  id: string,
  lock = false,
) {
  const item = (
    await db.query<Operation>(
      'SELECT id,kind,status,items,lease_until AS "leaseUntil",created_at AS "createdAt" FROM operations WHERE workspace_id=$1 AND id=$2' +
        (lock ? " FOR UPDATE" : ""),
      [w, id],
    )
  ).rows[0];
  invariant(item, 404, "NOT_FOUND", "작업을 찾을 수 없습니다.");
  return item;
}
const statusFor = (items: OperationItem[]): Operation["status"] =>
  items.some((i) => i.status === "pending")
    ? "queued"
    : items.some((i) => i.status === "failed")
      ? "failed"
      : items.some((i) => i.status === "cancelled")
        ? "cancelled"
        : "completed";
async function persist(tx: DbSession, w: string, job: Operation) {
  await tx.query(
    "UPDATE operations SET status=$3,items=$4::text::jsonb,lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE workspace_id=$1 AND id=$2",
    [w, job.id, job.status, JSON.stringify(job.items)],
  );
}
export async function controlOperation(
  db: Database,
  w: string,
  id: string,
  action: "cancel" | "retry" | "recover",
) {
  await db.transaction(async (tx) => {
    const job = await getOperation(tx, w, id, true);
    if (action === "cancel") {
      invariant(
        job.status !== "completed",
        409,
        "COMPLETED",
        "이미 완료된 작업입니다.",
      );
      job.items = job.items.map((i) =>
        ["pending", "running"].includes(i.status)
          ? { ...i, status: "cancelled" }
          : i,
      );
      job.status = "cancelled";
    } else {
      if (action === "recover") {
        invariant(
          job.status === "running" &&
            !!job.leaseUntil &&
            new Date(job.leaseUntil).getTime() < Date.now(),
          409,
          "LEASE_ACTIVE",
          "실행 중인 작업은 유효 시간이 지난 뒤 복구할 수 있습니다.",
        );
        job.items = job.items.map((i) =>
          i.status === "running"
            ? {
                ...i,
                status: "failed",
                error:
                  "실행이 중단되었습니다. 모델 요청은 이미 과금됐을 수 있습니다. 결과를 확인한 뒤 직접 재시도하세요.",
              }
            : i,
        );
      } else {
        invariant(
          job.status !== "running" &&
            job.items.some((i) => i.status === "failed"),
          409,
          "NO_RETRY",
          "실패한 항목이 없거나 실행 중입니다.",
        );
        job.items = job.items.map((i) =>
          i.status === "failed"
            ? { ...i, status: "pending", error: undefined }
            : i,
        );
      }
      job.status = statusFor(job.items);
    }
    await persist(tx, w, job);
  });
  return getOperation(db, w, id);
}
export async function runOperationStep(
  db: Database,
  w: string,
  id: string,
  accessCode: string | null,
) {
  const token = randomUUID();
  const claimed = await db.transaction(async (tx) => {
    const job = await getOperation(tx, w, id, true);
    invariant(
      job.status === "queued",
      409,
      "OPERATION_NOT_QUEUED",
      "계속할 작업이 없거나 이미 실행 중입니다.",
    );
    const index = job.items.findIndex((i) => i.status === "pending");
    invariant(index >= 0, 409, "NO_ITEMS", "실행할 항목이 없습니다.");
    job.items[index].status = "running";
    await tx.query(
      "UPDATE operations SET status='running',items=$3::text::jsonb,lease_token=$4,lease_until=NOW()+INTERVAL '2 minutes',updated_at=NOW() WHERE workspace_id=$1 AND id=$2",
      [w, id, JSON.stringify(job.items), token],
    );
    return { job, index };
  });
  try {
    let prepared: Deck | undefined;
    if (claimed.job.kind === "generate") {
      const input = generationInputSchema.parse(
        claimed.job.items[claimed.index].input,
      );
      await rateLimit(db, w, "generate", 8);
      const templates = await listTemplates(db, w);
      prepared = buildDeterministicDeck(
        input.brief,
        templates,
        input.theme,
        input.count,
        randomUUID,
      );
      if (input.provider === "openai") {
        await authorizeAi(db, accessCode);
        prepared = await adaptDeckWithOpenAi(prepared, templates);
      }
    }
    await db.transaction(async (tx) => {
      const job = await getOperation(tx, w, id, true);
      const lease = (
        await tx.query<{ lease_token: string }>(
          "SELECT lease_token FROM operations WHERE workspace_id=$1 AND id=$2",
          [w, id],
        )
      ).rows[0];
      if (job.status !== "running" || lease.lease_token !== token) return;
      const item = job.items[claimed.index],
        atomic = atomicDb(db, tx);
      if (job.kind === "import")
        item.result = await insertTemplate(
          atomic,
          w,
          templateInputSchema.parse(item.input),
          true,
        );
      else if (job.kind === "generate") {
        invariant(prepared, 500, "MISSING_RESULT", "생성 결과가 없습니다.");
        await insertDeck(atomic, w, prepared);
        item.result = prepared;
      } else {
        const input = item.input as Extract<
          OperationInput,
          { kind: "impact" }
        >["decks"][number] & { templateId: string; templateVersion: number };
        const target = await getTemplate(tx, w, input.templateId, true),
          deck = await getDeck(tx, w, input.id);
        invariant(
          target.status === "approved" &&
            target.version === input.templateVersion &&
            deck.version === input.expectedVersion,
          409,
          "VERSION_CONFLICT",
          "템플릿이나 프레젠테이션이 변경되었습니다. 영향을 다시 확인해 새 작업을 만드세요.",
        );
        const impact = templateImpact(
          deck,
          await getDeckTemplates(tx, w, [deck]),
          target,
          input.corrections,
        );
        invariant(
          !impact.blocked && impact.changes.length > 0,
          422,
          "UNMAPPED_CONTENT",
          "누락 내용이나 품질 오류를 해결한 뒤 다시 적용하세요.",
        );
        const slides = deck.slides.map(
          (slide, index) =>
            impact.changes.find((c) => c.index === index)?.after ?? slide,
        );
        item.result = await updateDeck(
          atomic,
          w,
          deck.id,
          { title: deck.title, slides },
          input.expectedVersion,
        );
      }
      item.status = "completed";
      job.status = statusFor(job.items);
      await persist(tx, w, job);
      await appendEvent(
        tx,
        w,
        job.kind === "import" ? "template" : "deck",
        id,
        "operation.item.completed",
        `${item.label} 처리 완료`,
      );
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      const job = await getOperation(tx, w, id, true);
      const lease = (
        await tx.query<{ lease_token: string }>(
          "SELECT lease_token FROM operations WHERE workspace_id=$1 AND id=$2",
          [w, id],
        )
      ).rows[0];
      if (job.status !== "running" || lease.lease_token !== token) return;
      job.items[claimed.index] = {
        ...job.items[claimed.index],
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "작업을 완료하지 못했습니다.",
      };
      job.status = statusFor(job.items);
      await persist(tx, w, job);
    });
  }
  return getOperation(db, w, id);
}
