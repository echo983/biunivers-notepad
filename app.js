import {
  hostRequest,
  readTransfer,
  writeTransfer,
} from "./host-api.js";
import {
  getLaunchContext,
  onLaunchContextAvailable,
} from "./open-resource.js";

const editor = document.querySelector("#editor");
const filename = document.querySelector("#filename");
const status = document.querySelector("#status");
const count = document.querySelector("#count");
let currentHandle = null;
let dirty = false;
let busy = false;
let launchQueued = false;

function setStatus(message, failed = false) {
  status.textContent = message;
  status.dataset.failed = failed ? "true" : "false";
}

function updateTitle(name = "未命名.txt") {
  filename.textContent = `${dirty ? "● " : ""}${name}`;
}

function setDocument(text, handle = null) {
  editor.value = text;
  currentHandle = handle;
  dirty = false;
  editor.readOnly = Boolean(handle && !canWrite(handle));
  updateTitle(handle?.metadata?.name);
  count.textContent = `${text.length} 字符`;
  document.querySelector("#save").disabled = editor.readOnly;
}

function canWrite(handle) {
  return handle?.permissions?.includes("write") !== false;
}

function normalizeLaunchHandle(resource) {
  return {
    handleId: resource.handleId,
    permissions: resource.permissions,
    metadata: {
      name: resource.name,
      mediaType: resource.mediaType,
    },
  };
}

async function release(handle) {
  if (!handle) {
    return;
  }
  await hostRequest("file.release", { handleId: handle.handleId }).catch(
    () => {},
  );
}

async function run(action) {
  if (busy) {
    return;
  }
  busy = true;
  document.body.dataset.busy = "true";
  try {
    await action();
  } catch (error) {
    if (error.code !== "USER_CANCELLED") {
      setStatus(error.message || "操作失败", true);
    }
  } finally {
    busy = false;
    document.body.dataset.busy = "false";
    if (launchQueued) {
      launchQueued = false;
      queueMicrotask(() => void run(() => acceptLaunchContext()));
    }
  }
}

document.querySelector("#new").addEventListener("click", () => {
  void run(async () => {
    if (dirty && !confirm("放弃尚未保存的更改？")) {
      return;
    }
    await release(currentHandle);
    setDocument("");
    setStatus("已新建文档");
    editor.focus();
  });
});

document.querySelector("#open").addEventListener("click", () => {
  void run(async () => {
    if (dirty && !confirm("放弃尚未保存的更改？")) {
      return;
    }
    const handle = await hostRequest("file.open", { writable: true });
    try {
      const transfer = await hostRequest("file.readTransfer", {
        handleId: handle.handleId,
      });
      const text = await readTransfer(transfer);
      await release(currentHandle);
      setDocument(text, handle);
      setStatus(`已打开 ${handle.metadata.name}`);
      editor.focus();
    } catch (error) {
      await release(handle);
      throw error;
    }
  });
});

async function saveWithHandle(handle) {
  if (!canWrite(handle)) {
    const error = new Error("当前文件为只读，请使用另存为");
    error.code = "FILE_READ_ONLY";
    throw error;
  }
  const transfer = await hostRequest("file.writeTransfer", {
    handleId: handle.handleId,
  });
  const result = await writeTransfer(transfer, editor.value);
  const metadata = await hostRequest("file.getMetadata", {
    handleId: handle.handleId,
  });
  currentHandle = {
    ...handle,
    metadata,
  };
  dirty = false;
  updateTitle(metadata.name);
  setStatus(`已保存 revision ${result.revision}`);
}

async function saveAs() {
  const oldHandle = currentHandle;
  const handle = await hostRequest("file.saveAs", {
    suggestedName: oldHandle?.metadata?.name || "未命名.txt",
    mediaType: "text/plain",
  });
  try {
    await saveWithHandle(handle);
    if (oldHandle?.handleId !== handle.handleId) {
      await release(oldHandle);
    }
  } catch (error) {
    await release(handle);
    currentHandle = oldHandle;
    throw error;
  }
}

document.querySelector("#save").addEventListener("click", () => {
  void run(async () => {
    if (currentHandle) {
      await saveWithHandle(currentHandle);
    } else {
      await saveAs();
    }
  });
});

document.querySelector("#save-as").addEventListener("click", () => {
  void run(saveAs);
});

editor.addEventListener("input", () => {
  dirty = true;
  updateTitle(currentHandle?.metadata?.name);
  count.textContent = `${editor.value.length} 字符`;
  setStatus("有未保存的更改");
});

async function openHandle(handle, message = "已打开") {
  try {
    const transfer = await hostRequest("file.readTransfer", {
      handleId: handle.handleId,
    });
    const text = await readTransfer(transfer);
    await release(currentHandle);
    setDocument(text, handle);
    setStatus(`${message} ${handle.metadata.name}`);
    editor.focus();
  } catch (error) {
    await release(handle);
    throw error;
  }
}

async function acceptLaunchContext({ quietWhenAbsent = false } = {}) {
  let context;
  try {
    context = await getLaunchContext();
  } catch (error) {
    // contextAvailable is only a hint. A concurrent startup request may have
    // consumed the context before the notification is handled.
    if (error.code === "NO_LAUNCH_CONTEXT") {
      return;
    }
    if (
      quietWhenAbsent &&
      error.code === "OPEN_RESOURCE_UNSUPPORTED"
    ) {
      return;
    }
    throw error;
  }

  const handle = normalizeLaunchHandle(context.resource);
  if (dirty && !confirm("当前文档有未保存的更改。放弃更改并打开新文件？")) {
    await release(handle);
    setStatus("已取消打开新文件");
    return;
  }
  await openHandle(handle, canWrite(handle) ? "已打开" : "已只读打开");
}

window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
  }
});

setDocument("");
onLaunchContextAvailable(() => {
  if (busy) {
    launchQueued = true;
    return;
  }
  void run(() => acceptLaunchContext());
});
void run(() => acceptLaunchContext({ quietWhenAbsent: true }));
