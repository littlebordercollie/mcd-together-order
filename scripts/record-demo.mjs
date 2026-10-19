import { chromium } from "playwright";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir(".local/video", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: ".local/video", size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
const narration = [
  [0, "麦麦一起点，孩子慢慢选，家长接着买。"],
  [9, "家长先留下今天可以选的餐品。"],
  [18, "孩子看图片，听名称，选择想要的。"],
  [29, "每一类都能跳过。选好了，也能改主意。"],
  [40, "用图片清单，回看自己的选择。"],
  [49, "家长接手，核对餐品和数量。调整都会留下记录。"],
  [62, "演示到这里结束。真实购买，将由家长确认和付款。"],
];
try {
  await page.goto("http://127.0.0.1:3741");
  await page.waitForLoadState("networkidle");
  const start = Date.now();
  const at = async (sec) => {
    const ms = start + sec * 1000 - Date.now();
    if (ms > 0) await page.waitForTimeout(ms);
  };
  await at(9);
  await page.getByRole("button", { name: "开始一起点", exact: true }).click();
  await at(12);
  await page.locator('[data-action="hide"][data-id="demo-bigmac"]').click();
  await at(15);
  await page.locator('[data-action="hide"][data-id="demo-bigmac"]').click();
  await at(18);
  await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
  await at(21);
  await page.locator('[data-product="demo-chicken"] [data-listen]').click();
  await at(25);
  await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
  await at(29);
  await page.getByRole("button", { name: "小食", exact: true }).click();
  await at(32);
  await page
    .getByRole("button", { name: "选择薯条（中）", exact: true })
    .click();
  await at(35);
  await page.getByRole("button", { name: "饮品", exact: true }).click();
  await at(37);
  await page
    .getByRole("button", { name: "选择冰露饮用水", exact: true })
    .click();
  await at(40);
  await page
    .getByRole("button", { name: "我选好了", exact: true })
    .first()
    .click();
  await at(49);
  await page.getByRole("button", { name: "交给家长确认" }).click();
  await at(52);
  await page.getByRole("button", { name: "增加麦香鸡", exact: true }).click();
  await at(55);
  await page.getByRole("button", { name: "减少麦香鸡", exact: true }).click();
  await at(58);
  await page.getByRole("button", { name: "查看示例金额", exact: true }).click();
  await at(61);
  await page.locator("#parent-confirm").check();
  await at(62);
  await page.locator("#order-button").click();
  await at(74);
  await context.close();
  const path = await page.video().path();
  await copyFile(path, ".local/video/demo-source.webm");
} finally {
  await browser.close();
}
const inputs = [];
const filters = [];
for (let i = 0; i < narration.length; i++) {
  const [sec, text] = narration[i];
  const path = `.local/video/voice-${i}.aiff`;
  execFileSync("say", ["-v", "Tingting", "-r", "172", "-o", path, text]);
  inputs.push("-i", path);
  filters.push(`[${i + 1}:a]adelay=${sec * 1000}|${sec * 1000}[a${i}]`);
}
const mix =
  narration.map((_, i) => `[a${i}]`).join("") +
  `amix=inputs=${narration.length}:normalize=0:duration=longest,apad[audio]`;
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  ".local/video/demo-source.webm",
  ...inputs,
  "-filter_complex",
  [...filters, mix].join(";"),
  "-map",
  "0:v:0",
  "-map",
  "[audio]",
  "-c:v",
  "libx264",
  "-crf",
  "24",
  "-preset",
  "medium",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-t",
  "75",
  "-movflags",
  "+faststart",
  "docs/demo.mp4",
]);
await writeFile(
  "docs/demo-video.json",
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      capture:
        "真实本地演示页面，由 Playwright 操作并录屏；旁白后期配入，非实时 MCP 或真实付款录像。",
      viewport: { width: 1280, height: 900 },
      narration,
    },
    null,
    2,
  ) + "\n",
);
console.log("Recorded docs/demo.mp4");
