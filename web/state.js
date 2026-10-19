import { demoMenu, demoStore } from "./demo-data.js";
import { defaultSelection, resolveSelection } from "./options.js";
export const storageKey = "together-order-v1";
export const blankState = () => ({
  version: 1,
  mode: "demo",
  page: "welcome",
  category: "main",
  group: 0,
  store: { ...demoStore },
  menu: structuredClone(demoMenu),
  hidden: [],
  basket: {},
  selections: {},
  originalSelections: null,
  original: null,
  changes: [],
  quote: null,
  order: null,
});
export function restore(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(storageKey));
    if (
      s?.version !== 1 ||
      !Array.isArray(s.menu) ||
      !s.basket ||
      !["demo", "live"].includes(s.mode)
    )
      return blankState();
    // Quotes are intentionally renewed after refresh; choosing itself has no expiry.
    if (
      !["welcome", "prepare", "choose", "recap", "review", "done"].includes(
        s.page,
      ) ||
      !["main", "side", "drink"].includes(s.category) ||
      !Array.isArray(s.hidden) ||
      !Array.isArray(s.changes) ||
      !s.store?.storeCode
    )
      return blankState();
    if (
      !s.menu.every(
        (p) =>
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          ["main", "side", "drink"].includes(p.category),
      )
    )
      return blankState();
    if (
      !Object.entries(s.basket).every(
        ([id, q]) =>
          s.menu.some((p) => p.id === id) &&
          Number.isInteger(q) &&
          q >= 1 &&
          q <= 5,
      )
    )
      return blankState();
    s.group = Number.isInteger(s.group) && s.group >= 0 ? s.group : 0;
    s.quote = null;
    s.selections ||= {};
    s.originalSelections ||= {};
    return s;
  } catch {
    return blankState();
  }
}
export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export const selected = (s) =>
  s.menu
    .filter((p) => s.basket[p.id] > 0)
    .map((p) => ({
      ...resolveSelection(p, s.selections?.[p.id]),
      quantity: s.basket[p.id],
    }));
export const totalCount = (s) =>
  Object.values(s.basket).reduce((a, b) => a + b, 0);
export function choose(s, id) {
  if (!s.menu.some((p) => p.id === id) || s.hidden.includes(id) || s.basket[id])
    return false;
  s.basket[id] = 1;
  s.selections ||= {};
  const p = s.menu.find((p) => p.id === id);
  if (p.variants?.length && !s.selections[id])
    s.selections[id] = { ...defaultSelection(p), needsHelp: true };
  s.quote = null;
  if (s.original) s.changes.push({ id, before: 0, after: 1, actor: "child" });
  return true;
}
export function changeQuantity(s, id, next, byParent = false) {
  if (
    !s.menu.some((p) => p.id === id) ||
    !Number.isInteger(next) ||
    next < 0 ||
    next > 5
  )
    return false;
  const before = s.basket[id] || 0;
  if (next === before) return false;
  if (next === 0) delete s.basket[id];
  else s.basket[id] = next;
  s.quote = null;
  if (s.original)
    s.changes.push({
      id,
      before,
      after: next,
      actor: byParent ? "parent" : "child",
    });
  return true;
}
export function handoff(s) {
  if (!s.original) {
    s.original = structuredClone(s.basket);
    s.originalSelections = structuredClone(s.selections || {});
  }
  s.quote = null;
  s.page = "review";
}
export function basketSignature(s) {
  return JSON.stringify({
    store: s.store.storeCode,
    selections: Object.entries(s.selections || {})
      .filter(([id]) => s.basket[id] > 0)
      .sort(),
    items: Object.entries(s.basket)
      .filter(([, q]) => q > 0)
      .sort(),
  });
}

export function setSelection(s, id, choice, byParent = false) {
  const p = s.menu.find((p) => p.id === id);
  if (!p?.variants?.length) return false;
  const resolved = resolveSelection(p, choice);
  if (
    !p.variants.some(
      (v) =>
        v.code === choice.variantCode &&
        (!v.iceOptions.length ||
          v.iceOptions.some((i) => i.key === choice.iceKey)),
    )
  )
    return false;
  s.selections ||= {};
  const before = resolveSelection(p, s.selections[id]);
  if (JSON.stringify(s.selections[id]) === JSON.stringify(choice)) return false;
  s.selections[id] = { ...choice };
  s.quote = null;
  if (s.original)
    s.changes.push({
      id,
      type: "options",
      before: before.displayName,
      after: resolved.displayName,
      actor: byParent ? "parent" : "child",
    });
  return true;
}
