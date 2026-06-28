const TOKEN_KEY = "aetherpanel_token";
const apiBase = "/api/v1";

export function token() {
  return localStorage.getItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const started = Date.now();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.replace(/\s+/g, " ").trim().slice(0, 500) };
    }
  }
  const event = new CustomEvent("aetherpanel:api", {
    detail: { path, method: options.method || "GET", status: response.status, ok: response.ok, duration_ms: Date.now() - started, message: body?.message || body?.error },
  });
  window.dispatchEvent(event);
  if (!response.ok) throw new Error(body?.message || body?.error || `Request failed ${response.status}`);
  return body;
}

export async function login(email: string, password: string) {
  const result = await api<{ token: string; user: unknown }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, result.token);
  return result.user;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.reload();
}
