// The browser keeps only choices; the server rebuilds official arguments from its menu.
export function defaultSelection(p) {
  const v = p.variants?.find((v) => v.isDefault) || p.variants?.[0];
  return v
    ? {
        variantCode: v.code,
        iceKey:
          (v.iceOptions.find((i) => i.isDefault) || v.iceOptions[0])?.key || "",
        needsHelp: false,
      }
    : null;
}
export function resolveSelection(p, choice) {
  const fallback = defaultSelection(p);
  if (!fallback)
    return {
      ...p,
      displayName: p.name,
      optionText: "",
      nameAudio: p.audio ? ["name-" + p.audio] : [],
    };
  const c = choice || { ...fallback, needsHelp: true };
  const v = p.variants.find((v) => v.code === c.variantCode);
  const ice = v?.iceOptions.find((i) => i.key === c.iceKey);
  if (!v || (v.iceOptions.length && !ice))
    return {
      ...p,
      selection: c,
      needsHelp: true,
      optionText: "请重新确认规格",
      displayName: p.name,
      nameAudio: [],
    };
  const optionText = [ice?.name, c.needsHelp ? "和家长一起确认" : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    ...p,
    name: v.name,
    audio: v.audio || p.audio,
    priceFen: v.priceFen ?? null,
    selection: c,
    needsHelp: !!c.needsHelp,
    optionText,
    displayName: [v.name, optionText].filter(Boolean).join(" · "),
    nameAudio: [
      v.audio ? "name-" + v.audio : "",
      ice?.audio,
      c.needsHelp ? "option-pending" : "",
    ].filter(Boolean),
  };
}
export function selectionSteps(p) {
  const variants = p.variants || [];
  return [
    new Set(variants.map((v) => v.kind)).size > 1 ? "kind" : "",
    new Set(variants.map((v) => v.size)).size > 1 ? "size" : "",
    variants.some((v) => v.iceOptions.length) ? "ice" : "",
  ].filter(Boolean);
}
export const kindLabels = { regular: "可乐", zero: "无糖可乐" };
export const sizeLabels = { small: "小杯", medium: "中杯", large: "大杯" };
export function stepChoices(p, draft, step) {
  const v = p.variants.find((v) => v.code === draft.variantCode);
  if (step === "ice")
    return v.iceOptions.map((i) => ({
      value: i.key,
      label: i.name,
      audio: i.audio,
      selected: draft.iceKey === i.key,
    }));
  const pool =
    step === "size" ? p.variants.filter((x) => x.kind === v.kind) : p.variants;
  return [...new Set(pool.map((x) => x[step]))].map((value) => ({
    value,
    label: (step === "kind" ? kindLabels : sizeLabels)[value] || value,
    audio: step + "-" + value,
    selected: v[step] === value,
  }));
}
export function pickOption(p, draft, step, value) {
  const current = p.variants.find((v) => v.code === draft.variantCode);
  if (step === "ice") {
    if (!current.iceOptions.some((i) => i.key === value)) return draft;
    return { ...draft, iceKey: value, needsHelp: false };
  }
  const v =
    p.variants.find(
      (v) =>
        v[step] === value &&
        v[step === "kind" ? "size" : "kind"] ===
          current[step === "kind" ? "size" : "kind"],
    ) || p.variants.find((v) => v[step] === value);
  if (!v) return draft;
  return {
    ...draft,
    variantCode: v.code,
    iceKey: v.iceOptions.some((i) => i.key === draft.iceKey)
      ? draft.iceKey
      : (v.iceOptions.find((i) => i.isDefault) || v.iceOptions[0])?.key || "",
    needsHelp: false,
  };
}
