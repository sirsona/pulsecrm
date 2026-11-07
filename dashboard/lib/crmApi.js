// Browser-side API client for the CRM.
// Requests go through the Next.js proxy at /api/proxy so the Express API can
// stay on the private network and the browser never needs a public API URL.

const BASE = "/api/proxy";

function token() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const authToken = token();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    redirectToLogin();
    throw new Error("Not authenticated");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      data?.error?.message || data?.error || `Request failed (${res.status})`,
    );
  }
  return data;
}

export async function listLeads({
  search = "",
  status = "",
  assignedTo,
  limit = 50,
  offset = 0,
} = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (assignedTo) params.set("assignedTo", assignedTo);

  const { leads } = await request(`/leads?${params.toString()}`);
  return { leads };
}

export async function getLead(id) {
  const { lead } = await request(`/leads/${id}`);
  return { lead };
}

export async function updateLead(id, { status }) {
  const { lead } = await request(`/leads/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return lead;
}

export async function claimLead(id) {
  const { lead } = await request(`/leads/${id}/claim`, { method: "POST" });
  return lead;
}

export async function reassignLead(id, assignedTo) {
  const { lead } = await request(`/leads/${id}/assign`, {
    method: "PATCH",
    body: JSON.stringify({ assignedTo }),
  });
  return lead;
}

export async function getStats() {
  return request("/leads/stats");
}

// Escape hatch for endpoints that do not need a dedicated helper.
export async function api(path, options = {}) {
  return request(path, options);
}

export async function sendBroadcast(text) {
  return request("/telegram/broadcast", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function getCronRuns() {
  return request("/cron/runs");
}

export async function getCronJobs() {
  return request("/cron/jobs");
}

export async function triggerCronJob(jobName) {
  return request(`/cron/trigger/${jobName}`, { method: "POST" });
}
