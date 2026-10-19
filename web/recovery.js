import { esc, money } from "./views.js";

export function recoveryView(result) {
  if (result.state === "none")
    return '<p>本机没有需要找回的订单。</p><button class="button primary full" data-action="close">知道了</button>';
  const cards = result.candidates
    .map(
      (o) => `
    <article class="recovery-card">
      <h3>${esc(o.storeName)}</h3>
      <p class="recovery-meta">${esc(o.createdAt)}<br>订单号：${esc(o.orderId)}<br>${esc(o.status)}</p>
      <ul>${o.items.map((p) => `<li><span>${esc(p.name)}</span><b>× ${p.quantity}</b></li>`).join("")}</ul>
      <div class="recovery-total"><span>官方订单金额</span><strong>${money(o.totalFen)}</strong></div>
      <label class="confirm-check"><input type="checkbox" data-recovery-confirm="${esc(o.orderId)}"><span>已核对这笔订单</span></label>
      <button class="button primary full" data-action="recover" data-id="${esc(o.orderId)}" disabled>恢复这笔订单</button>
    </article>`,
    )
    .join("");
  return `${
    result.candidates.length
      ? '<p><span class="phrase">门店、餐品、数量和金额相符。</span><br><span class="phrase">请家长再核对下单时间。</span></p>' +
        cards
      : '<p>暂未找到符合这次选择的订单。</p><p><span class="phrase">历史记录可能不完整，</span><wbr><span class="phrase">也可能还没更新。</span><br><span class="phrase">请到官方小程序核对，</span><wbr><span class="phrase">暂时不要重新下单。</span></p>'
  }
    <div class="dialog-actions recovery-actions"><button class="button secondary" data-action="close">稍后再看</button><button class="button secondary" data-action="recovery">重新查询</button></div>`;
}
