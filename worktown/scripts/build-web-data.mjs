// backend/src/pavilions.mjs から、ブラウザに公開してよい項目だけを
// web/data/pavilions.js に書き出す（focus = サーバ側の指示文は含めない）。
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAVILIONS, CONSULT } from "../backend/src/pavilions.mjs";

const pick = (p) => ({
  id: p.id,
  name: p.name,
  tagline: p.tagline,
  icon: p.icon,
  color: p.color,
  role: p.role,
  missions: p.missions.map(({ focus, ...m }) => m),
});

const data = { pavilions: PAVILIONS.map(pick), consult: pick(CONSULT) };
const out = fileURLToPath(new URL("../web/data/pavilions.js", import.meta.url));
writeFileSync(
  out,
  "// 自動生成ファイル（scripts/build-web-data.mjs）。直接編集しないでください。\n" +
    `window.TOWN = ${JSON.stringify(data, null, 2)};\n`,
);
console.log(`wrote ${out}`);
