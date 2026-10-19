import { esc, listen } from "./views.js";
import { resolveSelection, selectionSteps, stepChoices } from "./options.js";

function optionPicture(step, choice) {
  const amount =
    step === "size"
      ? { small: 0.66, medium: 0.82, large: 1 }[choice.value]
      : 0.85;
  const ice =
    step === "ice"
      ? { "ice-none": 0, "ice-less": 1, "ice-standard": 3, "ice-more": 5 }[
          choice.audio
        ]
      : 0;
  return `<svg class="option-picture" viewBox="0 0 120 120" aria-hidden="true"><g transform="translate(${60 - 52 * amount},${112 - 104 * amount}) scale(${amount})"><path d="M21 24h62l-8 79H29Z" fill="${step === "ice" ? "#dbe8e5" : "#e5c283"}" stroke="#243f53" stroke-width="3"/><path d="M18 24h68M30 14h43" stroke="#243f53" stroke-width="5" stroke-linecap="round"/>${Array.from({ length: ice }, (_, i) => `<rect x="${32 + (i % 2) * 21}" y="${36 + Math.floor(i / 2) * 20}" width="16" height="16" rx="4" fill="#fff" stroke="#3b6d82" stroke-width="2"/>`).join("")}${step === "ice" && ice === 0 ? '<path d="M40 64h28" stroke="#243f53" stroke-width="4" stroke-linecap="round"/>' : ""}${step === "kind" && choice.value === "zero" ? '<text x="52" y="78" text-anchor="middle" font-size="36" font-weight="700" fill="#243f53">0</text>' : ""}</g></svg>`;
}
export function optionView(p, draft, index, group, parent) {
  const steps = selectionSteps(p),
    step = steps[index],
    choices = stepChoices(p, draft, step);
  const current = resolveSelection(p, { ...draft, needsHelp: false });
  const question = {
    kind: "想喝哪一种？",
    size: "想要多大杯？",
    ice: "想加多少冰？",
  }[step];
  return `<button class="dialog-close" data-action="close" aria-label="关闭">×</button>
  <div class="option-heading"><span class="eyebrow">${parent ? "一起调整" : "慢慢选"} · ${index + 1} / ${steps.length}</span><h2 id="dialog-title" tabindex="-1">${question}</h2>${listen(question, "option-" + step)}</div>
  <div class="option-current"><img src="${esc(p.image)}" alt="${esc(p.name)}"><div><span>现在选的是</span><strong>${esc(current.name)}</strong><span>${esc(current.optionText)}</span></div></div>
  <div class="option-grid">${choices
    .slice(group * 3, group * 3 + 3)
    .map(
      (c) =>
        `<button class="option-card ${c.selected ? "active" : ""}" data-action="option-pick" data-step="${step}" data-value="${esc(c.value)}" data-audio-hover="${esc(c.audio)}" aria-pressed="${c.selected}" aria-label="${esc(c.label)}">${optionPicture(step, c)}<strong>${esc(c.label)}</strong><span>${c.selected ? "✓ 已选" : "点这里选"}</span></button>`,
    )
    .join("")}</div>
  <div class="option-navigation">${index > 0 ? '<button class="button secondary" data-action="option-back" data-audio-hover="option-back">上一步</button>' : ""}${choices.length > 3 ? '<button class="button secondary" data-action="option-group">' + (group ? "回看其他冰量" : "还有一种冰量") + "</button>" : ""}${index < steps.length - 1 ? '<button class="button secondary" data-action="option-next" data-audio-hover="option-next">下一步</button>' : ""}</div>
  <p class="option-note">${p.variants.length === 1 ? "这款只有当前杯型，可以选择冰量。" : "大小和冰量都可以改，想好了再确认。"}</p>
  <div class="option-footer"><button class="button primary full" data-action="option-save" data-audio-hover="option-confirm">${parent ? "确认这些选择" : "就按这些选，放进餐盘"}</button>${parent ? "" : '<button class="button quiet full" data-action="option-help" data-audio-hover="option-help">和家长一起选</button>'}</div>`;
}
