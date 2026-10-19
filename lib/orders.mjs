import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import {
  assert,
  validateItems,
  normalizeQuote,
  paymentUrl,
} from "./domain.mjs";
export class Orders {
  constructor({
    mcp,
    storeFor,
    productFor,
    unit,
    enabled = false,
    file = new URL("../.local/order-journal.json", import.meta.url).pathname,
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
      beCode: store.beCode,
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
    const args = this.base(store, items),
      q = normalizeQuote(
        await this.mcp.call("calculate-price", args),
        items,
        this.unit,
      );
    const record = {
      ...q,
      id: randomUUID(),
      expiresAt: this.now() + 5 * 60 * 1000,
      args,
      store,
    };
    this.quotes.set(record.id, record);
    return this.publicQuote(record);
  }
  publicQuote({ args, store, ...q }) {
    return q;
  }
  async create({ quoteId, confirmedTotalFen, parentConfirmed, takeWayCode }) {
    assert(this.enabled, "尚未开启真实下单。");
    assert(!this.lock, "订单正在处理，请勿重复提交。");
    this.lock = true;
    try {
      const previous = await this.journal();
      if (previous?.quoteId === quoteId && previous.state === "created")
        return previous.result;
      assert(
        !previous || previous.state === "closed",
        "上一笔订单尚未核实完成，请先查询官方状态，勿重复创建。",
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
          JSON.stringify(fresh.lines) === JSON.stringify(q.lines),
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
      };
      await this.persist(attempt);
      try {
        const data = await this.mcp.call("create-order", args);
        assert(data.orderId, "官方没有返回订单号。");
        const result = {
          orderId: String(data.orderId),
          status: String(data.orderDetail?.orderStatus || "订单状态待查询"),
          payUrl: data.payH5Url ? paymentUrl(data.payH5Url) : "",
          pickupCode: String(data.orderDetail?.pickupCode || ""),
        };
        await this.persist({ ...attempt, state: "created", result });
        return result;
      } catch {
        await this.persist({ ...attempt, state: "uncertain" }).catch(() => {});
        throw new Error(
          "下单结果暂不明确。请先在麦当劳官方渠道核对历史订单，不要再次下单。",
        );
      }
    } finally {
      this.lock = false;
    }
  }
  async status(orderId) {
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
}
