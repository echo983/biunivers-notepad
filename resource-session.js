const protocol = "biunivers.resource-session/1";
const pending = new Map();
const listeners = new Set();
const activeSessions = new Set();
const hostOrigin = new URL(document.referrer).origin;

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.origin !== hostOrigin) return;
  const message = event.data;
  if (!message || message.protocol !== protocol) return;
  if (message.event === "launch.contextAvailable") {
    for (const listener of listeners) listener();
    return;
  }
  if (typeof message.requestId !== "string") return;
  const request = pending.get(message.requestId);
  if (!request) return;
  pending.delete(message.requestId);
  clearTimeout(request.timeout);
  if (message.ok) {
    request.resolve(message.result);
  } else {
    const error = new Error(
      message.error?.message || "Resource Session 请求失败",
    );
    error.code = message.error?.code || "RESOURCE_SESSION_FAILED";
    request.reject(error);
  }
});

export function resourceRequest(method, params = {}, timeoutMs = 5000) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      const error = new Error("宿主未响应 Resource Session v1");
      error.code = "RESOURCE_SESSION_UNSUPPORTED";
      reject(error);
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timeout });
    window.parent.postMessage(
      { protocol, requestId, method, params },
      hostOrigin,
    );
  });
}

export async function detectResourceSessions() {
  return await resourceRequest("resource.getCapabilities", {}, 1200);
}

export async function claimResourceLaunch() {
  return await resourceRequest("resource.claimLaunch");
}

export function onResourceLaunchAvailable(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function trackSession(session) {
  activeSessions.add(session.sessionId);
  return session;
}

export async function releaseSession(session) {
  if (!session) return;
  activeSessions.delete(session.sessionId);
  await resourceRequest("resource.release", {
    sessionIds: [session.sessionId],
  }).catch(() => {});
}

export async function readSession(session) {
  const response = await fetch(session.content.url, {
    headers: contentHeaders(session),
  });
  if (!response.ok) throw await responseError(response, "读取");
  return await response.text();
}

export async function writeSession(session, text) {
  const response = await fetch(session.content.url, {
    method: "PUT",
    headers: {
      ...contentHeaders(session),
      "Content-Type": "application/octet-stream",
    },
    body: new TextEncoder().encode(text),
  });
  if (!response.ok) throw await responseError(response, "保存");
  const saved = await response.json();
  const metadata = await resourceRequest("resource.getMetadata", {
    sessionId: session.sessionId,
  });
  Object.assign(session, metadata);
  return saved;
}

function contentHeaders(session) {
  return {
    Authorization:
      `${session.content.authorization} ${session.content.instanceToken}`,
    [session.content.sessionHeader]: session.sessionId,
  };
}

async function responseError(response, action) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const error = new Error(
    body?.error?.message || `${action}失败：HTTP ${response.status}`,
  );
  error.code = body?.error?.code || "RESOURCE_TRANSFER_FAILED";
  return error;
}

setInterval(() => {
  const sessionIds = [...activeSessions];
  if (sessionIds.length === 0) return;
  void resourceRequest("resource.renew", { sessionIds }).then((result) => {
    for (const rejected of result.rejected || []) {
      activeSessions.delete(rejected.sessionId);
    }
  }).catch(() => {});
}, 60_000);
