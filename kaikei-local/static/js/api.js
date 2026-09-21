// バックエンド API の薄いラッパー
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function handle(res) {
  if (res.ok) {
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }
  let detail = res.statusText;
  let body = null;
  try {
    body = await res.json();
    if (Array.isArray(body.detail)) {
      detail = body.detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join(" / ");
    } else {
      detail = body.detail || detail;
    }
  } catch (_) { /* not json */ }
  throw new ApiError(detail, res.status, body);
}

export const api = {
  get: (url, params) => {
    const u = new URL(url, location.origin);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    return fetch(u).then(handle);
  },
  post: (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(handle),
  put: (url, body) => fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(handle),
  patch: (url, body) => fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then(handle),
  del: (url) => fetch(url, { method: "DELETE" }).then(handle),
  upload: (url, file, fields) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    Object.entries(fields || {}).forEach(([k, v]) => fd.append(k, v));
    return fetch(url, { method: "POST", body: fd }).then(handle);
  },
  downloadUrl: (url, params) => {
    const u = new URL(url, location.origin);
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    return u.toString();
  },
};
