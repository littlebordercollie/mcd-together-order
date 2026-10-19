import {
  blankState,
  restore,
  save,
  choose,
  selected,
  totalCount,
  changeQuantity,
  handoff,
  basketSignature,
} from "./state.js";
import { categories } from "./demo-data.js";
import { configuration, api } from "./api.js";
import { speak, stopAudio, bindHoverAudio, enableVoice } from "./audio.js";
import {
  shell,
  welcome,
  prepare,
  chooseView,
  recap,
  review,
  done,
  esc,
  listen,
} from "./views.js";
import { icon, buddy } from "./icons.js";
import { recoveryView } from "./recovery.js";
const root = document.querySelector("#app"),
  modal = document.querySelector("#modal"),
  notice = document.querySelector("#notice");
let state = restore(),
  config = { live: false, orderEnabled: false },
  busy = false,
  noticeTimer;
function toast(text) {
  notice.textContent = text;
  notice.classList.add("visible");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("visible"), 5500);
}
function render() {
  const focus = document.activeElement?.closest("button");
  const oldKey = focus?.getAttribute("data-action");
  const oldId = focus?.getAttribute("data-id");
  const views = {
    welcome: () => welcome(state, config),
    prepare: () => prepare(state, config),
    choose: () => chooseView(state),
    recap: () => recap(state),
    review: () => review(state, config),
    done: () => done(state),
  };
  root.innerHTML = shell(state, (views[state.page] || views.welcome)());
  if (!save(state)) toast("浏览器没有保存成功，请先不要刷新页面。");
  root.querySelectorAll("img.food-photo").forEach((img) =>
    img.addEventListener("error", () => {
      img.classList.add("photo-error");
      img.alt = `${img.alt}，图片暂时未加载`;
    }),
  );
  if (oldKey) {
    const target = [...root.querySelectorAll("[data-action]")].find(
      (e) => e.dataset.action === oldKey && e.dataset.id === oldId,
    );
    target?.focus({ preventScroll: true });
  }
}
function go(page) {
  stopAudio();
  clearTimeout(noticeTimer);
  notice.textContent = "";
  notice.classList.remove("visible");
  state.page = page;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  root.querySelector("#main")?.focus({ preventScroll: true });
}
function dialog(title, html) {
  stopAudio();
  modal.innerHTML = `<button class="dialog-close" data-action="close" aria-label="关闭">${icon("close")}</button><h2 id="dialog-title">${title}</h2>${html}`;
  modal.showModal();
}
function close() {
  modal.close();
}
function parentHelp() {
  dialog(
    "我们一起看一看。",
    `${buddy("dialog-buddy")}<p>请家长或老师过来，<wbr>陪你一起选择。</p>${listen("请家长或老师过来，陪你一起选择。", "help")}<div class="dialog-actions"><button class="button secondary" data-action="close">我继续选</button><button class="button primary" data-action="help-parent">我是家长，查看清单</button></div>`,
  );
  speak("请家长或老师过来，陪你一起选择。", "help");
}
async function run(button, fn) {
  if (busy) return;
  busy = true;
  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  }
  try {
    await fn();
  } catch (err) {
    if (err.code === "ORDER_RECOVERY_REQUIRED") {
      config.hasPendingOrder = true;
      render();
      dialog(
        "先找回这笔订单",
        `<p>${esc(err.message)}</p><div class="dialog-actions"><button class="button secondary" data-action="close">稍后再看</button><button class="button primary" data-action="recovery">查询这笔订单</button></div>`,
      );
    } else toast(err.message);
  } finally {
    busy = false;
    if (button?.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }
}
function about() {
  dialog(
    "让“我想要”更容易被听见。",
    `<p>麦麦一起点面向培智学校学生与家长、监护人、教师：用少量图片和短语音帮助表达选择，由成年人核对和购买。</p><p>每个人需要的支持不同。可以自己选，也可以一起选。</p><div class="about-note"><p>当前为参赛原型，尚未开展学生试用。</p><p>演示餐品与价格仅用于体验。真实连接需在本机配置麦当劳 MCP；Token 不进入此公开网页。</p><p>非麦当劳官方产品。餐品图片来自麦当劳官网，权利归原权利人。学校案例仅提供交互设计参考。</p></div><button class="button primary full" data-action="close">知道了</button>`,
  );
}
function liveDialog() {
  dialog(
    "选择到店自取的餐厅",
    `<p>输入城市和附近地标，查询官方可用门店。</p><form id="store-search"><label class="field">城市<input name="city" required maxlength="40" placeholder="例如：北京市" autocomplete="address-level2"></label><label class="field">附近地标<input name="keyword" required maxlength="80" placeholder="例如：王府井" autocomplete="off"></label><button class="button primary full" type="submit">查询附近餐厅</button></form><div id="store-results" role="status"></div>`,
  );
}
async function loadStore(id) {
  const result = await api("menu", { storeCode: id });
  state = {
    ...blankState(),
    mode: "live",
    page: "prepare",
    store: result.store,
    menu: result.menu,
  };
  close();
  render();
  toast(`已取得 ${result.menu.length} 个单品，请家长确认可选范围。`);
}
async function act(action, id, button) {
  switch (action) {
    case "home":
      go("welcome");
      break;
    case "about":
      about();
      break;
    case "prepare":
      go("prepare");
      break;
    case "resume":
      go("choose");
      break;
    case "close":
      close();
      break;
    case "help":
      parentHelp();
      break;
    case "help-parent":
      close();
      handoff(state);
      go("review");
      break;
    case "live":
      if (config.live) liveDialog();
      break;
    case "recovery":
      await run(button, async () => {
        const result = await api("order-recovery", {});
        if (result.order) {
          state.order = result.order;
          close();
          go("done");
        } else dialog("找回刚才的订单", recoveryView(result));
      });
      break;
    case "recover":
      await run(button, async () => {
        const confirm = [
          ...modal.querySelectorAll("[data-recovery-confirm]"),
        ].find((el) => el.dataset.recoveryConfirm === id);
        if (!confirm?.checked)
          throw new Error("请先核对门店、餐品、数量、金额和时间。");
        state.order = await api("order-recover", {
          orderId: id,
          parentConfirmed: true,
        });
        close();
        go("done");
      });
      break;
    case "store":
      await run(button, () => loadStore(id));
      break;
    case "hide":
      if (state.basket[id]) {
        dialog(
          "这项已经被选中了。",
          `<p>收起后，会从这一餐的清单里拿掉。请先和孩子确认。</p><div class="dialog-actions"><button class="button secondary" data-action="close">继续保留</button><button class="button primary" data-action="confirm-hide" data-id="${esc(id)}">确认收起</button></div>`,
        );
        break;
      }
      if (state.hidden.includes(id))
        state.hidden = state.hidden.filter((x) => x !== id);
      else {
        state.hidden.push(id);
        state.quote = null;
      }
      render();
      break;
    case "confirm-hide":
      changeQuantity(state, id, 0, true);
      state.hidden.push(id);
      close();
      render();
      break;
    case "nothing":
      dialog(
        "这次先不选吗？",
        `<p>可以告诉家长：今天我先不选。</p><div class="dialog-actions"><button class="button secondary" data-action="close">我再看看</button><button class="button primary" data-action="confirm-nothing">这次先不选</button></div>`,
      );
      break;
    case "confirm-nothing":
      for (const p of selected(state)) changeQuantity(state, p.id, 0);
      close();
      go("recap");
      break;
    case "finish-empty":
      state.quote = { totalFen: 0 };
      state.order = null;
      go("done");
      break;
    case "start":
      enableVoice();
      state.category =
        categories.find((c) =>
          state.menu.some(
            (p) => p.category === c.id && !state.hidden.includes(p.id),
          ),
        )?.id || "main";
      state.group = 0;
      go("choose");
      speak("选你想要的。不着急，慢慢看。", "start");
      break;
    case "category":
      stopAudio();
      state.category = id;
      state.group = 0;
      render();
      break;
    case "group":
      state.group =
        (state.group + 1) %
        Math.ceil(
          state.menu.filter(
            (p) =>
              p.category === state.category && !state.hidden.includes(p.id),
          ).length / 3,
        );
      render();
      break;
    case "skip":
      state.category =
        categories[
          (categories.findIndex((c) => c.id === state.category) + 1) %
            categories.length
        ].id;
      state.group = 0;
      render();
      break;
    case "choose": {
      const p = state.menu.find((p) => p.id === id);
      if (!p) return;
      if (!choose(state, id)) {
        toast("已经选好了，还是一份。");
        return;
      }
      render();
      speak(`你选了，${p.name}。`, p.audio);
      toast(`已选：${p.name}`);
      break;
    }
    case "remove":
      changeQuantity(state, id, 0);
      render();
      toast("已经拿掉了。想要的话，还可以再选。");
      break;
    case "recap":
      if (totalCount(state)) go("recap");
      break;
    case "back-choice":
      state.quote = null;
      go("choose");
      break;
    case "handoff":
      handoff(state);
      go("review");
      break;
    case "quantity": {
      const qty = state.basket[id] || 0,
        delta = Number(button.dataset.delta);
      if (delta > 0 && qty >= 2) {
        dialog(
          "再加一份吗？",
          `<p>已经选了 ${qty} 份${esc(state.menu.find((p) => p.id === id)?.name)}。</p><div class="dialog-actions"><button class="button secondary" data-action="close">保持现在的数量</button><button class="button primary" data-action="confirm-add" data-id="${esc(id)}">确认再加一份</button></div>`,
        );
      } else {
        changeQuantity(state, id, qty + delta, true);
        render();
      }
      break;
    }
    case "confirm-add":
      changeQuantity(state, id, (state.basket[id] || 0) + 1, true);
      close();
      render();
      break;
    case "quote":
      await run(button, async () => {
        const signature = basketSignature(state);
        if (state.mode === "demo")
          state.quote = {
            id: crypto.randomUUID(),
            signature,
            totalFen: selected(state).reduce(
              (a, p) => a + p.quantity * p.priceFen,
              0,
            ),
            lines: selected(state).map((p) => ({
              name: p.name,
              quantity: p.quantity,
              subtotalFen: p.priceFen * p.quantity,
            })),
            takeWays: [],
          };
        else {
          const q = await api("quote", {
            storeCode: state.store.storeCode,
            items: selected(state).map((p) => ({
              productCode: p.id,
              quantity: p.quantity,
            })),
          });
          if (signature !== basketSignature(state))
            throw new Error("选择发生变化，请重新核价。");
          state.quote = { ...q, signature };
        }
        render();
      });
      break;
    case "order":
      await run(button, async () => {
        if (!document.querySelector("#parent-confirm")?.checked)
          throw new Error("请先和孩子确认这一餐。");
        if (!state.quote || state.quote.signature !== basketSignature(state))
          throw new Error("清单已改变，请重新核价。");
        if (state.mode === "demo") {
          state.order = null;
          go("done");
          return;
        }
        if (!config.orderEnabled)
          throw new Error("尚未开启真实下单。请先完成本机连接验证。");
        const q = state.quote;
        state.order = await api("order", {
          quoteId: q.id,
          confirmedTotalFen: q.totalFen,
          parentConfirmed: true,
          takeWayCode: document.querySelector("#takeway")?.value,
        });
        go("done");
      });
      break;
    case "status":
      await run(button, async () => {
        if (!state.order?.orderId)
          throw new Error("订单结果还不明确，请先核对官方历史订单。");
        state.order = await api("order-status", {
          orderId: state.order.orderId,
        });
        render();
      });
      break;
    case "review":
      go("review");
      break;
    case "restart":
      state = blankState();
      go("prepare");
      break;
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action],[data-listen]");
  if (!b || b.disabled) return;
  if (busy && !b.hasAttribute("data-listen")) {
    e.preventDefault();
    toast("正在处理，请稍等一下。");
    return;
  }
  e.preventDefault();
  if (b.hasAttribute("data-listen")) {
    speak(b.dataset.text, b.dataset.listen, b);
    return;
  }
  act(b.dataset.action, b.dataset.id, b).catch((err) => toast(err.message));
});
document.addEventListener("change", (e) => {
  if (e.target.hasAttribute("data-recovery-confirm")) {
    const b = e.target
      .closest(".recovery-card")
      .querySelector('[data-action="recover"]');
    b.disabled = !e.target.checked;
  }
  if (e.target.id === "parent-confirm") {
    const b = document.querySelector("#order-button");
    if (b)
      b.disabled =
        !e.target.checked || (state.mode === "live" && !config.orderEnabled);
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "store-search") return;
  e.preventDefault();
  const f = new FormData(e.target);
  run(e.submitter, async () => {
    const result = await api("stores", {
      city: f.get("city"),
      keyword: f.get("keyword"),
    });
    document.querySelector("#store-results").innerHTML = result.stores.length
      ? result.stores
          .map(
            (s) =>
              `<button class="store-result" data-action="store" data-id="${esc(s.storeCode)}"><strong>${esc(s.name)}</strong><span>${esc(s.address)}</span></button>`,
          )
          .join("")
      : "没有找到当前可用门店，请换一个位置关键词。";
  });
});
document.addEventListener("audio-error", () =>
  toast("语音暂时无法播放，可以先看图片和文字。"),
);
modal.addEventListener("close", stopAudio);
bindHoverAudio(root);
bindHoverAudio(modal);
render();
configuration().then((c) => {
  config = c;
  if (state.mode === "live" && !c.live) {
    toast("当前没有连接真实菜单。已保留选择，请在本机连接后继续。");
  }
  render();
});
