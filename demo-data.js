// Illustrative prices and IDs. Never send these demo IDs to the official MCP.
export const categories = [
  {
    id: "main",
    name: "主食",
    question: "想吃哪个主食？",
    icon: "burger",
    audio: "main",
  },
  {
    id: "side",
    name: "小食",
    question: "想吃哪个小食？",
    icon: "fries",
    audio: "side",
  },
  {
    id: "drink",
    name: "饮品",
    question: "想喝什么？",
    icon: "cup",
    audio: "drink",
  },
];
export const demoStore = {
  storeCode: "demo-store",
  beCode: "demo",
  name: "一起点体验餐厅",
  address: "演示门店",
};
export const demoMenu = [
  ["bigmac", "巨无霸", "main", 2500, "一个汉堡"],
  ["chicken", "麦香鸡", "main", 1400, "一个汉堡"],
  ["fish", "麦香鱼", "main", 1900, "一个汉堡"],
  ["cheese", "吉士汉堡包", "main", 1300, "一个汉堡"],
  ["fries", "薯条（中）", "side", 1300, "一份薯条"],
  ["nuggets", "麦乐鸡（5块）", "side", 1400, "一份有五块"],
  ["corn", "玉米杯（大）", "side", 1200, "一杯玉米"],
  ["cola", "可口可乐（中）", "drink", 1100, "一杯可乐"],
  ["orange", "美汁源阳光橙（中）", "drink", 1200, "一杯饮料"],
  ["water", "冰露饮用水", "drink", 800, "一瓶水"],
].map(([id, name, category, priceFen, description]) => ({
  id: `demo-${id}`,
  name,
  category,
  priceFen,
  description,
  image: `assets/food/${id}.jpg`,
  audio: id,
  source: "demo",
}));

// Illustrative options mirror the interaction; these identifiers never go to MCP.
const demoCola = demoMenu.find((p) => p.id === "demo-cola");
demoCola.name = "可乐";
demoCola.audio = "live-cola";
const demoIce = [
  { key: "none", name: "去冰", audio: "ice-none" },
  { key: "less", name: "少冰", audio: "ice-less" },
  { key: "standard", name: "标准冰", audio: "ice-standard", isDefault: true },
  { key: "more", name: "多冰", audio: "ice-more" },
];
demoCola.variants = ["regular", "zero"].flatMap((kind) =>
  ["small", "medium", "large"].map((size, i) => ({
    code: `demo-cola-${kind}-${size}`,
    kind,
    size,
    name:
      (kind === "zero" ? "无糖可口可乐" : "可乐") + ["小杯", "中杯", "大杯"][i],
    audio: "cola-" + (kind === "zero" ? "zero-" : "") + size,
    priceFen: [1100, 1150, 1350][i],
    isDefault: kind === "regular" && size === "medium",
    iceOptions: demoIce,
  })),
);
