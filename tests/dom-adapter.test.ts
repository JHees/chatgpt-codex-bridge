import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { AppChatDomAdapter } from "../packages/renderer-plugin/src/dom-adapter.js";

const correlation = (sessionId = "session-1", turnId = "turn-1") => ({ sessionId, turnId });

function protocolJson(sessionId = "session-1", turnId = "turn-1", summary = "ok") {
  return JSON.stringify({
    protocol: "codex-chat-bridge/v1",
    sessionId,
    turnId,
    status: "complete",
    summary,
    actions: [],
  });
}

function chatDocument() {
  const window = new Window({ url: "app://-/index.html" });
  window.document.body.innerHTML = `
    <button aria-label="新对话">新对话</button>
    <button aria-label="返回">返回</button>
    <button aria-label="切换模式，当前模式：ChatGPT">ChatGPT</button>
    <button aria-label="选择 ChatGPT 模型">思考强度高</button>
    <div role="textbox" aria-label="renamed composer" contenteditable="true" class="ProseMirror"></div>`;
  return window as unknown as { document: Document };
}

function onTrustedEnter(document: Document, handler: () => void) {
  document.querySelector('[role="textbox"]')?.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") handler();
  });
}

async function exchangeWithTrustedEnter(
  adapter: AppChatDomAdapter,
  document: Document,
  message: string,
  marker: string,
  ids = correlation(),
) {
  const first = await adapter.exchange(message, marker, ids);
  if (typeof first === "string") return first;
  expect(first).toEqual({ $loaderHostAction: { version: 1, type: "press-enter" } });
  const KeyboardEventConstructor = document.defaultView?.KeyboardEvent;
  if (KeyboardEventConstructor === undefined) throw new Error("Missing KeyboardEvent constructor");
  document.activeElement?.dispatchEvent(new KeyboardEventConstructor("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
  }));
  return await adapter.exchange(message, marker, ids);
}

describe("AppChatDomAdapter", () => {
  it("uses the unique composer and trusted Enter without a Send button or composer label", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");

    await expect(adapter.exchange("message marker-1", "marker-1", correlation())).resolves.toEqual({
      $loaderHostAction: { version: 1, type: "press-enter" },
    });
    expect(document.querySelector('[role="textbox"]')?.textContent).toContain("marker-1");
    expect(document.activeElement).toBe(document.querySelector('[role="textbox"]'));
  });

  it("never retries an unconfirmed trusted Enter", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 5 });
    await adapter.beginSession("session-1");
    await adapter.exchange("message marker-1", "marker-1", correlation());

    await expect(adapter.exchange("message marker-1", "marker-1", correlation())).rejects.toMatchObject({
      code: "SEND_UNCERTAIN",
      message: expect.stringContaining("activeComposer=true"),
    });
  });

  it("reports bounded state when a confirmed message receives no reply", async () => {
    const { document } = chatDocument();
    onTrustedEnter(document, () => {
      const text = document.querySelector('[role="textbox"]')?.textContent ?? "";
      document.querySelector('[role="textbox"]')?.remove();
      document.body.insertAdjacentHTML("beforeend", `<article><p>${text}</p><button aria-label="编辑消息">编辑消息</button></article>`);
    });
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 5 });
    await adapter.beginSession("session-1");

    await expect(exchangeWithTrustedEnter(adapter, document, "message marker-1", "marker-1")).rejects.toMatchObject({
      code: "REPLY_TIMEOUT",
      message: expect.stringContaining("back=1, new=1, mode=1, model=1"),
    });
  });

  it("correlates protocol JSON split across spans without assistant controls", async () => {
    const { document } = chatDocument();
    onTrustedEnter(document, () => {
      const text = document.querySelector('[role="textbox"]')?.textContent ?? "";
      document.body.insertAdjacentHTML("beforeend", `
        <article><p>${text}</p><button aria-label="编辑消息">编辑消息</button></article>
        <section><span>{"protocol":"codex-chat-bridge/v1",</span><span>"sessionId":"session-1","turnId":"turn-1","status":"complete","summary":"split","actions":[]}</span></section>`);
    });
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 50 });
    await adapter.beginSession("session-1");

    await expect(exchangeWithTrustedEnter(adapter, document, "message marker-1", "marker-1")).resolves.toContain("split");
  });

  it("fails closed when two different replies match one turn", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `
      <article><p>marker-1</p><button aria-label="编辑消息">编辑消息</button></article>
      <section>${protocolJson("session-1", "turn-1", "first")}</section>
      <section>${protocolJson("session-1", "turn-1", "second")}</section>`);

    await expect(adapter.exchange("must not send", "marker-1", correlation())).rejects.toMatchObject({ code: "DOM_AMBIGUOUS" });
  });

  it("supports English navigation labels and Medium reasoning", async () => {
    const window = new Window({ url: "app://-/index.html" });
    const document = window.document as unknown as Document;
    document.body.innerHTML = `
      <button aria-label="New chat">New chat</button>
      <button aria-label="Back">Back</button>
      <button aria-label="Switch mode, current mode: ChatGPT">ChatGPT</button>
      <button aria-label="Select ChatGPT model">Thinking effort Medium</button>
      <div role="textbox" aria-label="changed" contenteditable="true"></div>`;
    onTrustedEnter(document, () => {
      const text = document.querySelector('[role="textbox"]')?.textContent ?? "";
      document.body.insertAdjacentHTML("beforeend", `
        <article><p>${text}</p><button aria-label="Edit message">Edit message</button></article>
        <section>${protocolJson("session-en", "turn-en", "English")}</section>`);
    });
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 50 });
    await adapter.beginSession("session-en");

    await expect(exchangeWithTrustedEnter(
      adapter,
      document,
      "message marker-en",
      "marker-en",
      correlation("session-en", "turn-en"),
    )).resolves.toContain("English");
  });

  it("rejects non-main renderers and Pro mode", async () => {
    const other = new Window({ url: "app://-/settings.html" });
    const otherAdapter = new AppChatDomAdapter(other.document as unknown as Document, { timeoutMs: 5 });
    await expect(otherAdapter.beginSession("session-1")).rejects.toMatchObject({ code: "SESSION_LOST" });

    const pro = chatDocument();
    pro.document.querySelector('[aria-label="切换模式，当前模式：ChatGPT"]')?.setAttribute("aria-label", "切换模式，当前模式：Pro");
    const proAdapter = new AppChatDomAdapter(pro.document, { pollMs: 1, timeoutMs: 5 });
    await expect(proAdapter.beginSession("session-1")).rejects.toMatchObject({ code: "CHAT_CONFIGURATION_REQUIRED" });
  });

  it("upgrades an unsupported reasoning level to High", async () => {
    const { document } = chatDocument();
    const model = document.querySelector<HTMLElement>('[aria-label="选择 ChatGPT 模型"]')!;
    model.textContent = "思考强度低";
    model.addEventListener("pointerdown", () => {
      const high = document.createElement("button");
      high.setAttribute("role", "menuitem");
      high.textContent = "高";
      high.addEventListener("click", () => {
        model.textContent = "思考强度高";
        high.remove();
      });
      document.body.append(high);
    });
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, timeoutMs: 20 });

    await expect(adapter.beginSession("session-1")).resolves.toBeUndefined();
    expect(model.textContent).toBe("思考强度高");
  });

  it("continues reading an existing turn without sending again", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `
      <article><p>marker-1</p><button aria-label="编辑消息">编辑消息</button></article>
      <section>${protocolJson()}</section>`);

    await expect(adapter.exchange("must not send", "marker-1", correlation())).resolves.toContain("ok");
    expect(document.querySelector('[role="textbox"]')?.textContent).toBe("");
  });

  it("reopens the exact conversation before a new turn", async () => {
    const { document } = chatDocument();
    onTrustedEnter(document, () => {
      document.body.insertAdjacentHTML("beforeend", `
        <div role="listitem" data-sidebar-chatgpt-conversation-key="chatgpt:conversation:bridge">
          <button aria-label="Bridge chat">Bridge chat</button>
          <button aria-label="置顶聊天">置顶聊天</button>
          <button aria-label="聊天操作">聊天操作</button>
        </div>
        <article><p>marker-1</p><button aria-label="编辑消息">编辑消息</button></article>
        <section>${protocolJson()}</section>`);
    });
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 50 });
    await adapter.beginSession("session-1");
    await exchangeWithTrustedEnter(adapter, document, "message marker-1", "marker-1");
    document.querySelector('[role="textbox"]')?.remove();

    const row = document.querySelector<HTMLElement>('[data-sidebar-chatgpt-conversation-key]')!;
    row.addEventListener("pointerdown", (event) => {
      if (event.target === row) document.body.insertAdjacentHTML("beforeend", '<div role="textbox" contenteditable="true"></div>');
    });

    await expect(adapter.exchange("message marker-2", "marker-2", correlation("session-1", "turn-2"))).resolves.toEqual({
      $loaderHostAction: { version: 1, type: "press-enter" },
    });
  });

  it("restores the originating task through the exact Back action", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `
      <article id="anchor"><p>marker-1</p><button aria-label="编辑消息">编辑消息</button></article>
      <section>${protocolJson()}</section>`);
    await adapter.exchange("must not send", "marker-1", correlation());
    document.querySelector('[aria-label="返回"]')?.addEventListener("pointerdown", () => {
      document.querySelector("#anchor")?.remove();
    });

    await expect(adapter.finishSession("session-1")).resolves.toBeUndefined();
  });
});
