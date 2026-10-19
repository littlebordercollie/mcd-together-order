import { execFileSync } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
const prompts = {
  start: "选你想要的。不着急，慢慢看。",
  main: "想吃哪个主食？选你想要的。不想要也可以。",
  side: "想吃哪个小食？选你想要的。不想要也可以。",
  drink: "想喝什么？选你想要的。不想要也可以。",
  help: "请家长或老师过来，陪你一起选择。",
  bigmac: "巨无霸。一个汉堡。",
  chicken: "麦香鸡。一个汉堡。",
  fish: "麦香鱼。一个汉堡。",
  cheese: "吉士汉堡包。一个汉堡。",
  fries: "薯条，中份。一份薯条。",
  nuggets: "麦乐鸡，五块。一份有五块。",
  corn: "玉米杯，大杯。一杯玉米。",
  cola: "可口可乐，中杯。一杯可乐。",
  orange: "美汁源阳光橙，中杯。一杯饮料。",
  water: "冰露饮用水。一瓶水。",
};
await mkdir(".local/audio", { recursive: true });
for (const [key, text] of Object.entries(prompts)) {
  execFileSync("say", [
    "-v",
    "Tingting",
    "-r",
    "155",
    "-o",
    `.local/audio/${key}.aiff`,
    text,
  ]);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    `.local/audio/${key}.aiff`,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "96k",
    `web/assets/audio/${key}.mp3`,
  ]);
  console.log(key);
}
await writeFile(
  "docs/audio-sources.json",
  JSON.stringify(
    { engine: "macOS say", voice: "Tingting", rate: 155, prompts },
    null,
    2,
  ) + "\n",
);
