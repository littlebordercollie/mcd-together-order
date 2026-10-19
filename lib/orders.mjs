import { fileURLToPath } from "node:url";
import {
  recoveryCandidates,
  verifyRecoveredDetail,
} from "./order-recovery.mjs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import {
  assert,
  validateItems,
  normalizeQuote,
  paymentUrl,
  configureItem,
  configuredLabel,
} from "./domain.mjs";
export class Orders {
  constructor({
    mcp,
    storeFor,
    productFor,
    unit,
    enabled = false,
    file = fileURLToPath(
      new URL("../.local/order-journal.json", import.meta.url),
    ),
    now = () => Date.now(),
  }) {
    Object.assign(this, {
      mcp,
      storeFor,
      productFor,
      unit,
      enabled,
      file,
      now,
    });
    this.quotes = new Map();
    this.lock = false;
  }
  async journal() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw new Error("本机订单记录无法读取，请先核实历史订单。");
    }
  }
  async persist(data) {
    await mkdir(this.file.slice(0, this.file.lastIndexOf("/")), {
      recursive: true,
      mode: 0o700,
    });
    const tmp = this.file + ".tmp";
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await rename(tmp, this.file);
  }
  base(store, items) {
    return {
      storeCode: store.storeCode,
      orderType: 1,
      beType: 1,
      needTableware: false,
      items,
    };
  }
  async quote(storeCode, rawItems) {
    const store = this.storeFor(storeCode);
    assert(store, "请重新查询门店。");
    const items = validateItems(rawItems);
    for (const item of items) {
      assert(
        this.productFor(storeCode, item.productCode),
        "该餐品不在已加载的单品菜单中。",
      );
    }
    const configuredItems = items.map((item) =>
      configureItem(this.productFor(storeCode, item.productCode), item),
    );
    const args = this.base(store, configuredItems),
      q = normalizeQuote(
        await this.mcp.call("calculate-price", args),
        items,
        this.unit,
      );
    const record = {
      ...q,
      officialLines: q.lines,
      lines: q.lines.map((line) => {
        const item = items.find((i) => i.productCode === line.id);
        const label = configuredLabel(
          this.productFor(storeCode, line.id),
          item.selection,
        );
        return label ? { ...line, name: label, officialName: line.name } : line;
      }),
      id: randomUUID(),
      expiresAt: this.now() + 5 * 60 * 1000,
      args,
      store,
    };
    this.quotes.set(record.id, record);
    return this.publicQuote(record);
  }
  publicQuote({ args, store, officialLines, ...q }) {
    return q;
  }
  async exclusively(action) {
    assert(!this.lock, "订单正在处理，请勿重复提交。");
    this.lock = true;
    try {
      return await action();
    } finally {
      this.lock = false;
    }
  }
  async create(input) {
    assert(this.enabled, "尚未开启真实下单。");
    return this.exclusively(() => this.createConfirmed(input));
  }
  async createConfirmed({
    quoteId,
    confirmedTotalFen,
    parentConfirmed,
    takeWayCode,
  }) {
    const previous = await this.journal();
    if (previous?.quoteId === quoteId && previous.state === "created")
      return previous.result;
    if (previous && previous.state !== "closed")
      throw Object.assign(
        new Error("上一笔订单尚未核实完成，请先找回订单，勿重复创建。"),
        { code: "ORDER_RECOVERY_REQUIRED" },
      );
    const q = this.quotes.get(quoteId);
    assert(q && q.expiresAt > this.now(), "报价已过期，请重新核价。");
    assert(
      parentConfirmed === true && confirmedTotalFen === q.totalFen,
      "请明确确认当前报价和餐品。",
    );
    assert(
      q.takeWays.some((t) => t.code === takeWayCode),
      "请选择官方返回的取餐方式。",
    );
    const fresh = normalizeQuote(
      await this.mcp.call("calculate-price", q.args),
      q.args.items,
      this.unit,
    );
    assert(
      fresh.totalFen === q.totalFen &&
        JSON.stringify(fresh.lines) ===
          JSON.stringify(q.officialLines || q.lines),
      "价格或餐品发生变化，请重新核价并确认。",
    );
    assert(
      fresh.takeWays.some((t) => t.code === takeWayCode),
      "所选取餐方式已不可用。",
    );
    const args = { ...q.args, takeWayCode };
    await this.mcp.arguments("create-order", args);
    // Persist BEFORE the network mutation. An uncertain timeout remains locked across restarts.
    const attempt = {
      quoteId,
      state: "pending",
      startedAt: new Date(this.now()).toISOString(),
      snapshot: {
        storeCode: q.store.storeCode,
        storeName: q.store.name,
        items: q.args.items,
        totalFen: q.totalFen,
        requiresOptionVerification: q.lines.some((line) => !!line.officialName),
      },
    };
    await this.persist(attempt);
    try {
      const data = await this.mcp.call("create-order", args);
      assert(data.orderId, "官方没有返回订单号。");
      const result = {
        orderId: String(data.orderId),
        status: String(data.orderDetail?.orderStatus || "订单状态待查询"),
        payUrl: this.validPayUrl(data.payH5Url),
        storeName: String(data.orderDetail?.storeName || q.store.name || ""),
        totalFen: q.totalFen,
        items: q.lines.map((p) => ({ name: p.name, quantity: p.quantity })),
        pickupCode: String(data.orderDetail?.pickupCode || ""),
      };
      await this.persist({ ...attempt, state: "created", result });
      return result;
    } catch {
      await this.persist({ ...attempt, state: "uncertain" }).catch(() => {});
      throw Object.assign(
        new Error("下单结果暂不明确，请先查找这笔订单，不要再次下单。"),
        { code: "ORDER_RECOVERY_REQUIRED" },
      );
    }
  }
  validPayUrl(value) {
    if (!value) return "";
    try {
      return paymentUrl(value);
    } catch {
      return "";
    }
  }
  async status(orderId) {
    return this.exclusively(() => this.refreshStatus(orderId));
  }
  async refreshStatus(orderId) {
    const record = await this.journal();
    assert(
      record?.result?.orderId === orderId,
      "只查询本应用创建且有记录的订单。",
    );
    const data = await this.mcp.call("query-order", { orderId });
    assert(String(data.orderId) === orderId, "订单号不一致，已停止处理。");
    const result = {
      ...record.result,
      status: String(data.orderStatus || "订单状态待查询"),
      pickupCode: String(data.pickupCode || ""),
    };
    const closed = ["订单已取消", "订单已完成"].includes(result.status);
    await this.persist({
      ...record,
      state: closed ? "closed" : "created",
      result,
    });
    return result;
  }
  async recovery() {
    return this.exclusively(async () => {
      const record = await this.journal();
      if (!record) return { state: "none", candidates: [] };
      if (record.result?.orderId)
        return {
          state: record.state,
          order: await this.refreshStatus(record.result.orderId),
          candidates: [],
        };
      const candidates = recoveryCandidates(
        await this.mcp.call("order-list"),
        record,
      );
      return {
        state: record.state,
        startedAt: record.startedAt,
        snapshot: record.snapshot,
        candidates,
      };
    });
  }
  async recover({ orderId, parentConfirmed }) {
    assert(parentConfirmed === true, "请由家长核对这笔订单后再恢复。");
    return this.exclusively(async () => {
      const record = await this.journal();
      assert(
        record && ["pending", "uncertain"].includes(record.state),
        "当前没有需要找回的订单。",
      );
      const candidate = recoveryCandidates(
        await this.mcp.call("order-list"),
        record,
      ).find((c) => c.orderId === orderId);
      assert(candidate, "这笔订单不匹配本次选择，请重新查询并核对。");
      const data = await this.mcp.call("query-order", { orderId });
      verifyRecoveredDetail(data, candidate);
      const result = {
        ...candidate,
        status: String(data.orderStatus || "订单状态待查询"),
        pickupCode: String(data.pickupCode || ""),
        payUrl: this.validPayUrl(data.payH5Url),
      };
      await this.persist({
        ...record,
        state: ["订单已取消", "订单已完成"].includes(result.status)
          ? "closed"
          : "created",
        result,
        recoveredAt: new Date(this.now()).toISOString(),
      });
      return result;
    });
  }
}
