import { writeFile, mkdir } from "node:fs/promises";
import {
  EXAMPLE_BRIEF,
  SAMPLE_DECK_SLIDES,
  SEED_TEMPLATES,
} from "../src/lib/catalog";
import { exportPptx } from "../src/server/pptx";
import type { Deck } from "../src/lib/domain";
await mkdir(".artifacts", { recursive: true });
const deck: Deck = {
  id: "verification",
  title: "Slide Atlas export verification",
  brief: EXAMPLE_BRIEF,
  slides: SAMPLE_DECK_SLIDES,
  provider: "deterministic",
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
await writeFile(
  ".artifacts/slide-atlas-sample.pptx",
  await exportPptx(deck, SEED_TEMPLATES),
);
console.log("Wrote .artifacts/slide-atlas-sample.pptx");
