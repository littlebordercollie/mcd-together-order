import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { prompts, narration, voiceSettings } from "./audio-prompts.mjs";

const { values } = parseArgs({
  options: { "env-file": { type: "string" }, "dry-run": { type: "boolean" } },
});
const root = resolve(import.meta.dirname, "..");
const endpoint = "https://api.minimax.cn/v1/t2a_v2";
const entries = [
  ...Object.entries(prompts).map(([key, text]) => ({
    key,
    text,
    file: "web/assets/audio/minimax/" + key + ".mp3",
  })),
  ...narration.map(([, text], i) => ({
    key: "video-" + i,
    text,
    file: ".local/video/minimax-" + i + ".mp3",
  })),
];
if (values["dry-run"]) {
  console.log(
    JSON.stringify(
      {
        ...voiceSettings,
        files: entries.length,
        characters: entries.reduce((sum, e) => sum + [...e.text].length, 0),
        entries,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const env = parseEnv(
  await readFile(resolve(values["env-file"] || resolve(root, ".env")), "utf8"),
);
const key =
  process.env.API_KEY_MINIMAX ||
  process.env.MINIMAX_API_KEY ||
  env.API_KEY_MINIMAX ||
  env.MINIMAX_API_KEY;
if (!key)
  throw new Error(
    "请在本机配置 MiniMax API Key，或用 --env-file 指定已有配置文件。",
  );
const records = [];
await mkdir(resolve(root, ".local/minimax"), { recursive: true });
for (const entry of entries) {
  const output = resolve(root, entry.file);
  const receipt = resolve(root, ".local/minimax/" + entry.key + ".json");
  const request = {
    model: voiceSettings.model,
    text: entry.text,
    stream: false,
    output_format: "hex",
    voice_setting: {
      voice_id: voiceSettings.voice_id,
      speed: voiceSettings.speed,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1,
    },
    subtitle_enable: false,
  };
  let previous;
  try {
    previous = JSON.parse(await readFile(receipt, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (previous) {
    const bytes = await readFile(output);
    if (
      JSON.stringify(previous.request) !== JSON.stringify(request) ||
      createHash("sha256").update(bytes).digest("hex") !== previous.sha256
    )
      throw new Error("已有音频与生成记录不一致，停止：" + entry.key);
    records.push(previous);
    console.log("已核对并跳过 " + entry.key);
    continue;
  }
  try {
    await readFile(output);
    throw new Error("目标文件已有内容且无生成记录：" + entry.key);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log("生成 " + entry.key + "（" + [...entry.text].length + " 字符）");
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(120000),
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      "MiniMax 网络请求未完成：" + entry.key + "；没有自动重试。",
    );
  }
  if (!response.ok)
    throw new Error(
      "MiniMax HTTP " + response.status + "：" + entry.key + "；没有自动重试。",
    );
  const data = await response.json();
  if (
    data.base_resp?.status_code !== 0 ||
    data.data?.status !== 2 ||
    !/^(?:[\da-f]{2})+$/i.test(data.data?.audio || "")
  )
    throw new Error(
      "MiniMax 未返回完整音频：" +
        entry.key +
        "，业务码 " +
        Number(data.base_resp?.status_code) +
        "；没有自动重试。",
    );
  const bytes = Buffer.from(data.data.audio, "hex");
  await mkdir(dirname(output), { recursive: true });
  const temporary = output + ".tmp.mp3";
  await writeFile(temporary, bytes, { flag: "wx" });
  execFileSync("ffmpeg", ["-v", "error", "-i", temporary, "-f", "null", "-"]);
  await rename(temporary, output);
  const metadata = {
    key: entry.key,
    file: entry.file,
    createdAt: new Date().toISOString(),
    request,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    durationMs: data.extra_info?.audio_length,
    usageCharacters: data.extra_info?.usage_characters,
  };
  await writeFile(receipt, JSON.stringify(metadata, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  records.push(metadata);
  await delay(6000);
}
await writeFile(
  resolve(root, "docs/audio-sources.json"),
  JSON.stringify(
    { engine: "MiniMax", endpoint, ...voiceSettings, prompts, records },
    null,
    2,
  ) + "\n",
);
console.log(
  "已生成并解码核对 " +
    records.length +
    " 条 MiniMax 语音；网页 " +
    Object.keys(prompts).length +
    " 条，视频 " +
    narration.length +
    " 条。",
);
