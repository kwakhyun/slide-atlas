import { copyFile, mkdir } from "node:fs/promises";
// Reproducible local font assets from the lockfile-pinned, OFL-licensed package.
await mkdir("public/fonts", { recursive: true });
await copyFile(
  "node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  "public/fonts/PretendardVariable.woff2",
);
await copyFile(
  "node_modules/pretendard/dist/LICENSE.txt",
  "public/fonts/OFL.txt",
);
