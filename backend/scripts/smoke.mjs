const base = process.env.BASE_URL || "http://localhost:5000";

async function jsonOrText(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => null);
  return res.text().catch(() => null);
}

async function main() {
  const health = await fetch(`${base}/health`);
  console.log("health", health.status);

  const email = `smoke_${Date.now()}@example.com`;
  const password = "testpass1";

  const reg = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Smoke", email, password })
  });
  const regBody = await jsonOrText(reg);
  console.log("register", reg.status);
  if (!reg.ok) {
    console.log(regBody);
    process.exit(1);
  }

  const token = regBody.token;

  const me = await fetch(`${base}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("me", me.status);

  const zones = await fetch(`${base}/api/zones`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("zones", zones.status);
  const zonesBody = await jsonOrText(zones);

  const list = Array.isArray(zonesBody?.zones) ? zonesBody.zones : [];
  const pickup = (list.find((z) => z.code === "ZONE_A") || list[0] || {}).code || "ZONE_A";
  const drop = (list.find((z) => z.code === "ZONE_B") || list[1] || {}).code || "ZONE_B";

  const create = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ pickup_zone: pickup, drop_zone: drop, weight: 1, priority: "MEDIUM" })
  });
  console.log("create task", create.status);

  const tasks = await fetch(`${base}/api/tasks`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("list tasks", tasks.status);

  const plan = await fetch(`${base}/api/tasks/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ text: "Deliver one item from zone a to zone b" })
  });
  console.log("plan", plan.status);

  const wave = await fetch(`${base}/api/tasks/wave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({})
  });
  console.log("wave (should 404)", wave.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
