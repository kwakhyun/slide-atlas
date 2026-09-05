import { AsyncLocalStorage } from "node:async_hooks";
import type { TeamRole } from "@/lib/permissions";
export type Actor = { accountId: string; username: string; role: TeamRole };
const context = new AsyncLocalStorage<Actor | undefined>();
export const currentActor = () => context.getStore();
export function asActor<T>(actor: Actor | undefined, work: () => T): T {
  return context.run(actor, work);
}
