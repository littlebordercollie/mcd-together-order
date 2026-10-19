import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url() === "https://www.mcdonalds.com.cn/media/product");
  if (!page)
    throw new Error(
      "Open the official media page in the shared browser first.",
    );
  const session = await page.context().newCDPSession(page);
  await session.send("Page.enable");
  const { frameTree } = await session.send("Page.getResourceTree");
  const rows = [
    ["bigmac", "巨无霸", "201701111552327010"],
    ["chicken", "麦香鸡", "201701111554599807"],
    ["fish", "麦香鱼", "201701111555445837"],
    ["cheese", "吉士汉堡包", "201701111551492349"],
    ["fries", "薯条中", "201701111600118272"],
    ["nuggets", "麦乐鸡5块", "201701111554414254"],
    ["corn", "大玉米杯", "201701111550334743"],
    ["cola", "可口可乐", "201701111553075221"],
    ["orange", "美汁源阳光橙", "201701111557328361"],
    ["water", "冰露包装饮用水", "201701111549358444"],
  ];
  const images = [];
  for (const [id, name, key] of rows) {
    const resource = frameTree.resources.find((r) => r.url.includes(key));
    if (!resource) throw new Error(`Missing browser resource ${id}`);
    const body = await session.send("Page.getResourceContent", {
      frameId: frameTree.frame.id,
      url: resource.url,
    });
    if (!body.base64Encoded) throw new Error(`Not binary ${id}`);
    const bytes = Buffer.from(body.content, "base64");
    await writeFile(`web/assets/food/${id}.jpg`, bytes);
    images.push({
      id,
      name,
      source: page.url(),
      url: resource.url,
      file: `assets/food/${id}.jpg`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    console.log(id, bytes.length);
  }
  await writeFile(
    "docs/food-sources.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        note: "官网历史媒体图用于演示，真实菜单使用 MCP 当前图片。图片权利归原权利人，不属于代码许可证。",
        images,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
