let csrf = "";
export async function configuration() {
  if (document.documentElement.dataset.build === "static")
    return { live: false, orderEnabled: false };
  try {
    const r = await fetch("api/config");
    if (!r.ok) return { live: false, orderEnabled: false };
    const c = await r.json();
    csrf = c.csrf;
    return c;
  } catch {
    return { live: false, orderEnabled: false };
  }
}
export async function api(path, body) {
  let r, data;
  try {
    r = await fetch(`api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": csrf },
      body: JSON.stringify(body),
    });
    data = await r.json();
  } catch (error) {
    if (path === "order")
      throw Object.assign(
        new Error("连接中断，暂不能确认下单结果。请先查询订单。"),
        {
          code: "ORDER_RECOVERY_REQUIRED",
        },
      );
    throw error;
  }
  if (!r.ok)
    throw Object.assign(new Error(data.error || "连接没有完成，请稍后再试。"), {
      code: data.code,
    });
  return data;
}
