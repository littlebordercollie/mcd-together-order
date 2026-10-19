import { categories } from "./demo-data.js";
import { selected, totalCount } from "./state.js";
import { icon, buddy } from "./icons.js";
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (n) =>
  Number.isFinite(n) ? `¥${(n / 100).toFixed(2)}` : "待核价";
const btn = (action, label, cls = "", extra = "") =>
  `<button type="button" data-action="${action}" class="button ${cls}" ${extra}>${label}</button>`;
export function listen(text, key = "", small = false) {
  return `<button type="button" class="listen ${small ? "small" : ""}" data-listen="${esc(key)}" data-text="${esc(text)}" aria-label="听一听：${esc(text)}">${icon("sound")}<span>听一听</span></button>`;
}
export function image(p, cls = "") {
  return `<img class="food-photo ${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="eager" referrerpolicy="no-referrer">`;
}
export function shell(s, content) {
  const live = s.mode === "live" || (s.page === "done" && s.order?.orderId);
  return `
<header class="topbar"><a href="#" class="brand" data-action="home" aria-label="麦麦一起点首页"><img src="assets/favicon.svg" alt="" width="42" height="42"><span>麦麦一起点<small>孩子慢慢选，家长接着买</small></span></a><div class="top-actions"><span class="mode-badge ${live ? "is-live" : ""}"><i></i>${live ? "真实连接" : "演示体验"}</span>${s.page !== "welcome" ? btn("help", `${icon("person")}<span>找家长</span>`, "quiet", 'aria-label="找家长"') : btn("about", "关于一起点", "quiet")}</div></header>
<main id="main" tabindex="-1">${content}</main>
<footer><span>慢慢选，也可以一起选。</span><span>${!live ? "示例菜单与价格 · 不产生真实订单" : "餐品及价格以官方实时结果为准"}<a href="#" data-action="about">作品说明</a><a href="https://github.com/littlebordercollie/mcd-together-order" target="_blank" rel="noreferrer">GitHub ↗</a></span></footer>`;
}
export function welcome(s, config) {
  return `
<section class="welcome"><div class="hero-copy"><div class="eyebrow"><span class="tiny-line"></span> 一起选择，一起出发</div><h1><span>我想吃什么，</span><span>让我慢慢选。</span></h1><p class="hero-sub"><span>用图片看一看，用语音听一听。</span><span>把想吃的交给家长，一起确认这一餐。</span></p><div class="hero-buttons">${btn("prepare", `开始一起点 ${icon("arrow")}`, "primary large")}${Object.keys(s.basket).length ? btn("resume", "继续上次的选择", "secondary") : ""}</div><div class="hero-foot">${icon("clock")}<span>不用赶时间，想改也可以。</span></div></div>
<div class="hero-art" aria-hidden="true"><div class="hand-note">这一餐，我来选。<svg viewBox="0 0 90 50"><path d="M5 5q40-5 66 30m-15-2 18 5-3-19"/></svg></div><div class="paper-tray"><div class="paper-label">我想要</div><div class="hero-foods"><div><img src="assets/food/chicken.jpg" alt=""><span>汉堡</span><b>✓</b></div><div><img src="assets/food/fries.jpg" alt=""><span>薯条</span><b>✓</b></div><div><img src="assets/food/water.jpg" alt=""><span>水</span><b>✓</b></div></div><div class="paper-bottom">${icon("heart")}<span>谢谢你听我说</span></div></div>${buddy("hero-buddy")}<div class="speech-note">我陪你，慢慢来。</div></div></section>
<section class="how-row" aria-label="一起点餐的三个步骤"><article><b>01</b><div><h2>家长先准备</h2><p>选好门店，留下适合的餐品。</p></div></article><article><b>02</b><div><h2>孩子自己选</h2><p>看图片、听语音，表达想法。</p></div></article><article><b>03</b><div><h2>一起确认这一餐</h2><p>家长核对清单，接着购买。</p></div></article></section>
<div class="welcome-bottom"><span>为培智学校学生与陪伴者设计的点餐沟通原型</span>${config.live ? btn("live", "连接真实门店", "text") : ""}${config.live && config.hasPendingOrder ? btn("recovery", "找回刚才的订单", "secondary") : ""}</div>`;
}
export function prepare(s, config) {
  return `<section class="page-heading"><div><span class="eyebrow">先由家长或老师准备</span><h1>把选择变得简单一点。</h1><p>留下今天可以选的餐品，再把设备交给孩子。</p></div>${buddy("small-buddy")}</section>
<section class="store-strip">${icon("location")}<div><strong>${esc(s.store.name)}</strong><span>${esc(s.store.address)} · 到店自取</span></div>${config.live ? btn("live", "换一家门店", "secondary") : ""}<span class="store-stamp">${s.mode === "demo" ? "示例门店" : "官方菜单"}</span></section>
<div class="section-line"><h2>今天可以选这些</h2><span>点一下可以收起；再次点击恢复。</span></div>
<div class="prepare-grid">${categories
    .map(
      (c) =>
        `<section class="prepare-category"><h3>${icon(c.icon)}${c.name}</h3>${
          s.menu
            .filter((p) => p.category === c.id)
            .map(
              (p) =>
                `<button class="prepare-item ${s.hidden.includes(p.id) ? "hidden-item" : ""}" data-action="hide" data-id="${esc(p.id)}" aria-pressed="${!s.hidden.includes(p.id)}">${image(p)}<span>${esc(p.name)}<small>${s.mode === "demo" ? "示例 " : ""}${money(p.priceFen)}</small></span><i>${s.hidden.includes(p.id) ? "＋" : "✓"}</i></button>`,
            )
            .join("") || "<p>这类暂时没有餐品。</p>"
        }</section>`,
    )
    .join("")}</div>
<div class="prepare-bottom"><p>${icon("heart")}<span>可以陪孩子一起看，<wbr>也可以让孩子自己慢慢选。</span></p>${btn("start", `准备好了，交给孩子 ${icon("arrow")}`, "primary large", s.menu.every((p) => s.hidden.includes(p.id)) ? "disabled" : "")}</div>`;
}
export function tray(s) {
  const list = selected(s);
  return `<aside class="tray"><div class="tray-heading">${icon("tray")}<h2>我选的这一餐</h2><span>${totalCount(s)} 份</span></div><div class="tray-content">${list.length ? list.map((p) => `<div class="tray-item">${image(p)}<div><strong>${esc(p.name)}</strong><span>${p.quantity} 份</span></div><button class="remove" data-action="remove" data-id="${esc(p.id)}" aria-label="不要${esc(p.name)}">${icon("close")}<span>不要了</span></button></div>`).join("") : `<div class="empty-tray">${buddy()}<p>想吃的放在这里。</p><span>先选一个看看吧。</span></div>`}</div><div class="tray-bottom">${btn("recap", `${icon("check")} 我选好了`, "primary full", list.length ? "" : "disabled")}<span>选好后，再请家长看一看。</span></div></aside>`;
}
export function chooseView(s) {
  const c = categories.find((c) => c.id === s.category);
  const all = s.menu.filter(
    (p) => p.category === c.id && !s.hidden.includes(p.id),
  );
  const pages = Math.ceil(all.length / 3);
  const list = all.slice(s.group * 3, s.group * 3 + 3);
  return `
<div class="choice-layout"><section class="choice-main"><nav class="category-tabs" aria-label="选择餐品种类">${categories.map((cat) => `<button data-action="category" data-id="${cat.id}" class="category-tab ${c.id === cat.id ? "active" : ""}" aria-pressed="${c.id === cat.id}">${icon(cat.icon)}<span>${cat.name}</span></button>`).join("")}</nav>
<div class="question"><div><span class="eyebrow">看看图片，选你想要的</span><h1>${c.question}</h1></div>${listen(`${c.question} 选你想要的。不想要也可以。`, c.audio)}</div>
<div class="food-grid">${list.map((p) => `<article class="food-card ${s.basket[p.id] ? "selected" : ""}" data-product="${esc(p.id)}"><div class="selection-label">${s.basket[p.id] ? `${icon("check")} 已选好` : "慢慢看"}</div><button class="food-pick" data-action="choose" data-id="${esc(p.id)}" aria-label="选${esc(p.name)}" aria-pressed="${!!s.basket[p.id]}">${image(p)}<h2>${esc(p.name)}</h2><p>${esc(p.description || "点图片，可以选它。")}</p></button><div class="food-actions">${listen(`${p.name}。${p.description || ""}`, p.audio, true)}${btn("choose", s.basket[p.id] ? `${icon("check")} 选好了` : "选这个", s.basket[p.id] ? "chosen" : "select-button", `data-id="${esc(p.id)}" aria-label="${s.basket[p.id] ? "已选" : "选择"}${esc(p.name)}"`)}</div></article>`).join("") || '<div class="empty-category"><p>这类暂时没有餐品。</p><p>可以看看其他的。</p></div>'}</div>
<div class="choice-nav"><div>${btn("skip", "先不选这类", "quiet")}${btn("nothing", "这次先不选", "quiet")}</div>${pages > 1 ? btn("group", `${icon("repeat")} 换一组`, "secondary", `aria-label="换一组，当前第${s.group + 1}组，共${pages}组"`) : '<span class="gentle-note">不着急，想好了再选。</span>'}</div>
<div class="companion-note">${buddy()}<p><strong>想改主意，也可以。</strong><span>选好的餐品，在旁边的餐盘里。</span></p></div></section>${tray(s)}</div><div class="mobile-traybar"><div class="mini-choices">${selected(
    s,
  )
    .slice(0, 3)
    .map((p) => image(p))
    .join(
      "",
    )}<span>${totalCount(s) ? `已选 ${totalCount(s)} 份` : "选好的放在餐盘里"}</span></div>${btn("recap", "我选好了", "primary", totalCount(s) ? "" : "disabled")}</div>`;
}
export function recap(s) {
  return `<section class="center-heading"><span class="eyebrow">我的选择</span><h1>${totalCount(s) ? "这些，就是我想要的。" : "今天先不选，也可以。"}</h1>${listen(
    totalCount(s)
      ? `我想要，${selected(s)
          .map((p) => `${p.quantity}份${p.name}`)
          .join("，")}。`
      : "今天先不选。请家长看看。",
    "",
  )}</section><div class="recap-grid">${selected(s)
    .map(
      (p) =>
        `<article class="recap-card">${image(p)}<h2>${esc(p.name)}</h2><b>${p.quantity} 份</b>${listen(p.name, p.audio, true)}${btn("remove", "不要了", "quiet", `data-id="${esc(p.id)}"`)}</article>`,
    )
    .join(
      "",
    )}</div><div class="handoff-note">${buddy()}<div><h2>请家长一起看一看。</h2><p>把设备交给家长，告诉他你的选择。</p></div></div><div class="center-actions">${btn("back-choice", `${icon("back")} 我再看看`, "secondary")}${btn("handoff", `${icon("person")} 交给家长确认`, "primary large")}</div>`;
}
export function review(s, config) {
  const list = selected(s);
  const origin = s.menu.filter((p) => s.original?.[p.id]);
  return `<section class="page-heading"><div><span class="eyebrow">家长接手 · 一起核对</span><h1><span class="phrase">孩子的想法，</span><wbr><span class="phrase">已经在这里。</span></h1><p>先问一句：“这就是你想要的吗？”</p></div>${btn("back-choice", `${icon("back")} 让孩子再选`, "secondary")}</section>
<div class="review-layout"><section><div class="intent-banner">${icon("heart")}<div><strong>第一次交接时的选择</strong><p>${origin.map((p) => `${esc(p.name)} × ${s.original[p.id]}`).join("、") || "暂未选择"}</p></div>${listen(origin.map((p) => `${s.original[p.id]}份${p.name}`).join("，"))}</div><div class="review-list">${list.map((p) => `<article class="review-item">${image(p)}<div class="review-name"><h2>${esc(p.name)}</h2><span>${s.mode === "live" ? `官方餐品编号 ${esc(p.id)}` : "示例餐品"}</span><strong>${s.mode === "demo" ? "示例单价 " : ""}${money(p.priceFen)}</strong></div><div class="quantity-control"><button data-action="quantity" data-id="${esc(p.id)}" data-delta="-1" aria-label="减少${esc(p.name)}">${icon("minus")}</button><output aria-label="${esc(p.name)}数量">${p.quantity}</output><button data-action="quantity" data-id="${esc(p.id)}" data-delta="1" ${p.quantity >= 5 ? "disabled" : ""} aria-label="增加${esc(p.name)}">${icon("plus")}</button></div></article>`).join("") || '<p class="empty-category">清单已清空，可以让孩子重新选择。</p>'}</div>${s.changes.length ? `<div class="changes"><strong>一起确认这些调整</strong><ul>${s.changes.map((c) => `<li>${c.actor === "child" ? "孩子" : "家长"}调整：${esc(s.menu.find((p) => p.id === c.id)?.name)}：${c.before} 份 → ${c.after} 份</li>`).join("")}</ul><span>请告诉孩子改了什么，再确认一次。</span></div>` : ""}</section>
<aside class="checkout"><div class="checkout-title">${icon("bag")}<h2>这一餐的清单</h2></div><div class="checkout-store">${icon("location")}<div><strong>${esc(s.store.name)}</strong><span>${esc(s.store.address)}<br>到店自取</span></div></div><div class="quote-lines">${s.quote ? s.quote.lines.map((l) => `<div><span>${esc(l.name)} × ${l.quantity}</span><b>${money(l.subtotalFen)}</b></div>`).join("") : "<p>核对数量后，查看这一餐的金额。</p>"}</div><div class="total"><span>${s.mode === "demo" ? "示例合计" : "官方核价"}</span><strong>${s.quote ? money(s.quote.totalFen) : "—"}</strong></div>
${!list.length ? `<p>孩子这次没有选餐品。</p>${btn("finish-empty", "知道了，这次先不买", "primary full")}` : s.quote ? `<p class="quote-caption">${s.mode === "demo" ? "此金额用于体验，不代表门店售价。" : "金额已更新，提交前会再次核价。"}</p>${s.quote.takeWays?.length ? `<label class="field">取餐方式<select id="takeway">${s.quote.takeWays.map((t) => `<option value="${esc(t.code)}">${esc(t.name)}</option>`).join("")}</select></label>` : ""}<label class="confirm-check"><input id="parent-confirm" type="checkbox"><span>已和孩子确认餐品、数量${s.mode === "live" ? "、门店和金额" : ""}</span></label>${btn("order", s.mode === "demo" ? "完成这一餐的沟通" : `${icon("bag")} 确认并创建订单`, "primary full", 'id="order-button" disabled')}${s.mode === "live" && !config.orderEnabled ? '<p class="small-note">本机尚未开启下单，请先完成连接验证。</p>' : ""}` : btn("quote", s.mode === "demo" ? "查看示例金额" : "获取官方实时价格", "primary full", list.length ? "" : "disabled")}
${s.mode === "live" && config.hasPendingOrder ? btn("recovery", "找回刚才的订单", "secondary full") : ""}
</aside></div>`;
}
export function done(s) {
  if (!totalCount(s) && !s.order?.orderId)
    return `<section class="done-panel">${buddy()}<span class="eyebrow">这也是我的选择</span><h1>今天先不选，也可以。</h1><p>这一餐先不买，没有创建订单。</p><div class="center-actions">${btn("back-choice", "我想再看看", "secondary")}${btn("home", "回到首页", "primary")}</div></section>`;
  const o = s.order;
  const live = s.mode === "live" || !!o?.orderId;
  return `<section class="done-panel">${buddy()}<span class="eyebrow">${live ? "家长付款与取餐" : "这一餐，已经说清楚了"}</span><h1>${live ? esc(o?.status || "订单状态待查询") : totalCount(s) ? "谢谢你，听我慢慢选。" : "今天先不选，也可以。"}</h1><p>${live ? "付款与取餐进度，以官方查询结果为准。" : totalCount(s) ? "孩子表达想法，家长接住选择。" : "不选择，也是一种想法。"}</p>${
    live
      ? `<div class="pay-block"><p>订单号：${esc(o?.orderId || "结果待核实")}</p>${o?.storeName ? `<h2>${esc(o.storeName)}</h2>` : ""}${o?.items?.length ? `<ul class="order-items">${o.items.map((p) => `<li><span>${esc(p.name)}</span><b>× ${p.quantity}</b></li>`).join("")}</ul>` : ""}${Number.isFinite(o?.totalFen) ? `<div class="recovery-total"><span>下单金额</span><strong>${money(o.totalFen)}</strong></div>` : ""}${o?.payUrl && !["订单已取消", "订单已完成"].includes(o.status) ? `<a class="button primary large" href="${esc(o.payUrl)}" target="_blank" rel="noreferrer">打开官方付款页面 ${icon("arrow")}</a>${o.qr ? `<img class="pay-qr" src="${esc(o.qr)}" alt="官方付款链接二维码">` : ""}` : !o?.payUrl ? "<p>请在麦当劳官方小程序中查看这笔订单。<br>这里可以继续查询订单状态。</p>" : ""}${o?.pickupCode ? `<strong class="pickup-code">取餐号：${esc(o.pickupCode)}</strong>` : ""}${btn("status", "查询官方订单状态", "secondary")}</div>`
      : `<div class="done-receipt">${selected(s)
          .map(
            (p) =>
              `<div>${image(p)}<span>${esc(p.name)}</span><b>× ${p.quantity}</b></div>`,
          )
          .join(
            "",
          )}<div class="receipt-total"><span>示例合计</span><b>${money(s.quote?.totalFen)}</b></div><small>演示已完成，没有创建订单或扣款。</small></div>`
  }<div class="center-actions">${btn(live ? "home" : "review", live ? "回到首页" : "回看清单", "secondary")}${!live ? btn("restart", "再体验一次", "primary") : ""}</div></section>`;
}
