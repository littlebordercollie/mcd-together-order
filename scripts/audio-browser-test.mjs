import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const report = {
  at: new Date().toISOString(),
  url: process.env.TEST_URL || "http://127.0.0.1:3741",
  checks: [],
  errors: [],
  recordings: [],
};
const base = process.env.TEST_URL || "http://127.0.0.1:3741";
const check = (name, result) => {
  assert.ok(result, name);
  report.checks.push(name);
};
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1366, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.addInitScript(() => {
      window.__audio = { played: [], fallback: 0, maxConcurrent: 0, media: [] };
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!window.__audio.media.includes(this))
          window.__audio.media.push(this);
        this.addEventListener(
          "playing",
          () => {
            window.__audio.played.push(this.currentSrc.split("/").pop());
            window.__audio.maxConcurrent = Math.max(
              window.__audio.maxConcurrent,
              window.__audio.media.filter((a) => !a.paused && !a.ended).length,
            );
          },
          { once: true },
        );
        return original.call(this);
      };
      speechSynthesis.speak = () => {
        window.__audio.fallback++;
      };
    });
    const read = () =>
      page.evaluate(() => ({
        played: window.__audio.played,
        fallback: window.__audio.fallback,
        maxConcurrent: window.__audio.maxConcurrent,
        state: JSON.parse(localStorage.getItem("together-order-v1")),
      }));
    const played = async (key, count = 1) =>
      page.waitForFunction(
        ([key, count]) =>
          window.__audio.played.filter((k) => k === key + ".mp3").length >=
          count,
        [key, count],
      );
    await page.goto(base);
    await page.getByRole("button", { name: "开始一起点", exact: true }).click();
    await page.getByRole("button", { name: "准备好了，交给孩子" }).click();
    await played("start");
    const fish = page.locator('[data-product="demo-fish"]');
    if (!mobile) {
      await fish.locator(".food-pick").hover();
      await played("fish");
      check("桌面：悬停图卡实际播放 MiniMax MP3", true);
      check(
        "桌面：悬停不会加入餐盘",
        Object.keys((await read()).state.basket).length === 0,
      );
      check(
        "桌面：图卡和听读按钮有播放状态",
        await fish.evaluate(
          (e) =>
            e.classList.contains("speaking") &&
            e.querySelector(".listen").textContent.includes("正在播放"),
        ),
      );
      await page.screenshot({
        path: "test-results/minimax-hover-desktop.png",
        fullPage: true,
      });
      await fish.locator(".listen").hover();
      await page.waitForTimeout(700);
      check(
        "桌面：同一图卡内移动不会反复重播",
        (await read()).played.filter((k) => k === "fish.mp3").length === 1,
      );
      await page.locator('[data-product="demo-bigmac"] .food-pick').hover();
      await page.mouse.move(5, 5);
      await page.waitForTimeout(650);
      check(
        "桌面：快速划过不触发朗读",
        !(await read()).played.includes("bigmac.mp3"),
      );
      await page.locator('[data-product="demo-chicken"] .listen').hover();
      await played("chicken");
      check("桌面：悬停听一听同样播放", true);
      await page.mouse.move(5, 5);
      await fish.locator(".food-pick").focus();
      await played("fish", 2);
      check("桌面：键盘聚焦也能播放", true);
    } else {
      await fish.locator(".listen").tap();
      await played("fish");
      check(
        "手机：点击听一听实际播放",
        Object.keys((await read()).state.basket).length === 0,
      );
      check(
        "手机：显示点按提示",
        (await page.locator(".touch-tip").isVisible()) &&
          !(await page.locator(".hover-tip").isVisible()),
      );
      await page.screenshot({
        path: "test-results/minimax-tap-mobile.png",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "选择麦香鸡", exact: true }).click();
    await played("selected-prefix");
    await played("name-chicken");
    check((mobile ? "手机" : "桌面") + "：选择反馈沿用同一音色", true);
    await page.mouse.move(5, 5);
    await page
      .getByRole("button", { name: "我选好了", exact: true })
      .first()
      .click();
    const recapListen = page.locator(".center-heading .listen");
    if (mobile) await recapListen.tap();
    else await recapListen.hover();
    await played("recap-prefix");
    await played("quantity-1");
    check(
      (mobile ? "手机" : "桌面") +
        "：整份清单由 MiniMax 名称和数量录音连续播放",
      (await read()).played.includes("name-chicken.mp3"),
    );
    await page.getByRole("button", { name: "交给家长确认" }).click();
    await page.locator(".intent-banner .listen").click();
    await played("original-prefix");
    await page.getByRole("button", { name: "让孩子再选" }).click();
    const before = (await read()).played.length;
    await page.waitForTimeout(1200);
    check(
      (mobile ? "手机" : "桌面") + "：离开页面停止清单续播",
      (await read()).played.length === before,
    );
    const evidence = await read();
    check(
      (mobile ? "手机" : "桌面") + "：没有系统语音回退",
      evidence.fallback === 0,
    );
    check(
      (mobile ? "手机" : "桌面") + "：没有音频叠播",
      evidence.maxConcurrent === 1,
    );
    check(
      (mobile ? "手机" : "桌面") + "：标题和页面没有横向溢出",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    report.recordings.push({
      device: mobile ? "mobile" : "desktop",
      played: evidence.played,
    });
    await context.close();
  }
  check("没有脚本异常", report.errors.length === 0);
  report.passed = true;
} finally {
  await browser.close();
  await writeFile(
    "test-results/minimax-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    errors: report.errors.length,
    passed: report.passed,
  }),
);
