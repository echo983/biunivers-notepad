const protocol = "biunivers.open-resource/1";
const pending = new Map();
const listeners = new Set();

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) {
    return;
  }
  const message = event.data;
  if (!message || message.protocol !== protocol) {
    return;
  }
  if (message.event === "launch.contextAvailable") {
    for (const listener of listeners) {
      listener();
    }
    return;
  }
  if (typeof message.requestId !== "string") {
    return;
  }
  const request = pending.get(message.requestId);
  if (!request) {
    return;
  }
  pending.delete(message.requestId);
  if (message.ok) {
    request.resolve(message.result);
  } else {
    const error = new Error(
      message.error?.message || "Open Resource 请求失败",
    );
    error.code = message.error?.code || "OPEN_RESOURCE_FAILED";
    request.reject(error);
  }
});

export function getLaunchContext() {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    window.parent.postMessage(
      {
        protocol,
        requestId,
        method: "launch.getContext",
        params: {},
      },
      "*",
    );
  });
}

export function onLaunchContextAvailable(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
