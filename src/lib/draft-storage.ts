import { z } from "zod";
import { slideSchema, type Deck } from "./domain";

const draftSchema = z.object({
  key: z.string(),
  owner: z.string().optional(),
  recordId: z.string().optional(),
  savedAt: z.number(),
  baseVersion: z.number().int().positive(),
  title: z.string().min(1).max(80),
  slides: z.array(slideSchema).min(1).max(12),
});
export type LocalDraft = z.infer<typeof draftSchema>;
export const draftKey = (workspaceId: string, deckId: string) =>
  `${workspaceId}/${deckId}`;
export function parseDraft(value: unknown, key: string): LocalDraft | null {
  const result = draftSchema.safeParse(value);
  return result.success &&
    result.data.key === key &&
    result.data.savedAt <= Date.now() + 60000 &&
    Date.now() - result.data.savedAt < 7 * 86400000
    ? result.data
    : null;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("slide-atlas-drafts-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "recordId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("다른 탭에서 초안 저장소를 사용하고 있습니다."));
  });
}
export async function readDraft(key: string, owner = "default") {
  const db = await database();
  try {
    return await new Promise<LocalDraft | null>((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").getAll();
      request.onsuccess = () => {
        const drafts = (request.result as unknown[])
          .map((value) => parseDraft(value, key))
          .filter((d): d is LocalDraft => !!d)
          .sort(
            (a, b) =>
              Number(b.owner === owner) - Number(a.owner === owner) ||
              b.savedAt - a.savedAt,
          );
        resolve(drafts[0] ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function writeDraft(
  key: string,
  deck: Deck | null,
  owner = "default",
) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      if (deck)
        store.put({
          key,
          owner,
          recordId: `${key}/${owner}`,
          savedAt: Date.now(),
          baseVersion: deck.version,
          title: deck.title,
          slides: deck.slides,
        });
      else store.delete(`${key}/${owner}`);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (item) {
          if (Date.now() - item.value.savedAt >= 7 * 86400000) item.delete();
          item.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
