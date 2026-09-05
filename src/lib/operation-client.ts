import { api } from "./api-client";
import type { Operation, OperationInput } from "./operations";
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("atlas-operation-changed"));
}
export async function continueOperation(
  job: Operation,
  accessCode = "",
  progress?: (job: Operation) => void,
) {
  let current = job;
  try {
    while (current.status === "queued") {
      current = await api<Operation>("/operations", {
        method: "PATCH",
        headers: { "x-ai-access-code": accessCode },
        body: JSON.stringify({ id: current.id, action: "run" }),
      });
      progress?.(current);
      changed();
    }
  } finally {
    changed();
  }
  return current;
}
export async function startOperation(
  input: OperationInput,
  accessCode = "",
  progress?: (job: Operation) => void,
) {
  const job = await api<Operation>("/operations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  changed();
  return continueOperation(job, accessCode, progress);
}
