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
  const r = await fetch(`api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Token": csrf },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "连接没有完成，请稍后再试。");
  return data;
}
