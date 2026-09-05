import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { AppChatDomAdapter } from "../packages/renderer-plugin/src/dom-adapter.js";
import { BridgeController } from "../packages/renderer-plugin/src/controller.js";

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
    if ((event as KeyboardEvent).key === "Enter") {
      handler();
      const composer = document.querySelector('[role="textbox"]');
      if (composer !== null) composer.textContent = "";
    }
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
  it("runs the real controller through repair, action result, duplicate read, and finish", async () => {
    const { document } = chatDocument();
    const controller = new BridgeController(new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 30 }));
    const request = {
      protocol: "codex-chat-bridge/v1", sessionId: "session-1", turnId: "turn-1", kind: "request",
      objective: "Verify integration", state: { phase: "verify", summary: "Ready", completed: [], blockers: [] },
      message: "What next?", actionResults: [],
    };
    let sends = 0;
    onTrustedEnter(document, () => {
      sends += 1;
      const user = document.createElement("article");
      const content = document.createElement("p");
      content.textContent = document.querySelector('[role="textbox"]')!.textContent;
      const edit = document.createElement("button");
      edit.setAttribute("aria-label", "编辑消息");
      user.append(content, edit);
      const answer = document.createElement("pre");
      const value = JSON.parse(protocolJson("session-1", sends === 3 ? "turn-2" : "turn-1"));
      if (sends === 1) value.kind = "response";
      if (sends === 2) {
        value.status = "continue";
        value.actions = [{ id: "a1", type: "verify", instruction: "Check a fixture", expectedResult: "Pass" }];
      }
      answer.textContent = JSON.stringify(value);
      document.body.append(user, answer);
    });
    const invoke = async (payload: unknown) => {
      const initial = await controller.exchange(payload);
      if (!("$loaderHostAction" in initial)) return initial;
      const KeyboardEventConstructor = document.defaultView!.KeyboardEvent;
      document.activeElement!.dispatchEvent(new KeyboardEventConstructor("keydown", { key: "Enter", bubbles: true }));
      return await controller.exchange(payload);
    };
    await expect(invoke(request)).rejects.toMatchObject({ code: "PROTOCOL_REPAIR_REQUIRED" });
    await expect(invoke(request)).resolves.toMatchObject({ status: "continue" });
    await expect(invoke(request)).resolves.toMatchObject({ status: "continue" });
    await expect(invoke({ ...request, turnId: "turn-2", kind: "result", actionResults: [{ actionId: "a1", outcome: "succeeded", summary: "Pass", evidence: ["fixture"] }] })).resolves.toMatchObject({ status: "complete" });
    expect(sends).toBe(3);
    document.querySelector('[aria-label="返回"]')!.addEventListener("pointerdown", () => {
      document.querySelectorAll('article,pre,[aria-label="返回"]').forEach((element) => element.remove());
    });
    await expect(controller.finish({ sessionId: "session-1" })).resolves.toEqual({ finished: true });
  });

  it("does not use a replacement composer before the first send", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.querySelector('[role="textbox"]')!.remove();
    document.body.insertAdjacentHTML("beforeend", '<div role="textbox" contenteditable="true"></div>');
    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).rejects.toMatchObject({ code: "SESSION_LOST" });
  });

  it("reads a repair only after its exact user anchor, not the original response", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `<article><p>marker-1</p><button aria-label="编辑消息"></button></article><section>${protocolJson("session-1", "turn-1", "old")}</section><article><p>marker-1:repair</p><button aria-label="编辑消息"></button></article><section>${protocolJson("session-1", "turn-1", "repaired")}</section>`);
    await expect(adapter.exchange("unused", "marker-1", correlation())).resolves.toContain('"old"');
    await expect(adapter.exchange("unused", "marker-1:repair", correlation())).resolves.toContain('"repaired"');
  });

  it("does not navigate back into a Chat after the user leaves it", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `<article><p>marker-1</p><button aria-label="编辑消息"></button></article><section>${protocolJson()}</section>`);
    await adapter.exchange("unused", "marker-1", correlation());
    document.querySelector("article")!.remove();
    await expect(adapter.checkSession()).rejects.toMatchObject({ code: "SESSION_LOST" });
  });

  it("rejects an extra rendered code block and validates wrong IDs instead of ignoring them", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `<article><p>marker-1</p><button aria-label="编辑消息"></button></article><pre>${protocolJson("wrong-session")}</pre>`);
    await expect(adapter.exchange("unused", "marker-1", correlation())).resolves.toContain("wrong-session");
    document.body.insertAdjacentHTML("beforeend", '<pre>an additional code block</pre>');
    await expect(adapter.exchange("unused", "marker-1", correlation())).rejects.toMatchObject({ code: "DOM_AMBIGUOUS" });
  });

  it("requires Back to leave Chat, not merely hide the old message", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 5 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `<article><p>marker-1</p><button aria-label="编辑消息"></button></article><section>${protocolJson()}</section>`);
    await adapter.exchange("unused", "marker-1", correlation());
    document.querySelector('[aria-label="返回"]')!.addEventListener("pointerdown", () => document.querySelector("article")!.remove());
    await expect(adapter.finishSession("session-1")).rejects.toMatchObject({ code: "RESTORE_REQUIRED" });
  });

  it("does not replace a user's unsent draft", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    const composer = document.querySelector('[role="textbox"]')!;
    composer.textContent = "My draft";
    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).rejects.toMatchObject({ code: "COMPOSER_NOT_EMPTY" });
    expect(composer.textContent).toBe("My draft");
  });

  it("does not send while another answer is generating", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", '<button aria-label="停止生成"></button>');
    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).rejects.toMatchObject({ code: "CHAT_BUSY" });
    expect(document.querySelector('[role="textbox"]')?.textContent).toBe("");
  });

  it("distinguishes a turn from longer IDs and its repair marker", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", '<article><p>marker-10</p><button aria-label="编辑消息"></button></article>');
    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).resolves.toHaveProperty("$loaderHostAction");
  });

  it("rejects two identical replies instead of merging them", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", `<article><p>marker-1</p><button aria-label="编辑消息"></button></article><section>${protocolJson()}</section><section>${protocolJson()}</section>`);
    await expect(adapter.exchange("request", "marker-1", correlation())).rejects.toMatchObject({ code: "DOM_AMBIGUOUS" });
  });

  it("ignores hidden, earlier, composer, and user-quoted protocol objects", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 5 });
    await adapter.beginSession("session-1");
    document.querySelector('[role="textbox"]')!.textContent = protocolJson();
    document.body.insertAdjacentHTML("beforeend", `<section>${protocolJson()}</section><article><p>marker-1\n${protocolJson()}</p><button aria-label="编辑消息"></button></article><div style="display:none"><section>${protocolJson()}</section></div>`);
    await expect(adapter.exchange("request", "marker-1", correlation())).rejects.toMatchObject({ code: "REPLY_TIMEOUT" });
  });

  it("passes malformed protocol blocks to validation rather than timing out", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", '<article><p>marker-1</p><button aria-label="编辑消息"></button></article><section>codex-bridge-response-v1<pre>{"protocol":"codex-chat-bridge/v1", broken JSON}</pre></section>');
    await expect(adapter.exchange("request", "marker-1", correlation())).resolves.toContain("broken JSON");
  });

  it("cancels a reply wait immediately on reset", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 100 });
    await adapter.beginSession("session-1");
    document.body.insertAdjacentHTML("beforeend", '<article><p>marker-1</p><button aria-label="编辑消息"></button></article>');
    const pending = adapter.exchange("request", "marker-1", correlation());
    await new Promise((resolve) => setTimeout(resolve, 2));
    adapter.resetSession();
    await expect(pending).rejects.toMatchObject({ code: "SESSION_LOST" });
  });

  it("uses the unique composer and trusted Enter without a Send button or composer label", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 20 });
    await adapter.beginSession("session-1");

    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).resolves.toEqual({
      $loaderHostAction: { version: 1, type: "press-enter" },
    });
    expect(document.querySelector('[role="textbox"]')?.textContent).toContain("marker-1");
    expect(document.activeElement).toBe(document.querySelector('[role="textbox"]'));
  });

  it("never retries an unconfirmed trusted Enter", async () => {
    const { document } = chatDocument();
    const adapter = new AppChatDomAdapter(document, { pollMs: 1, stableMs: 0, timeoutMs: 5 });
    await adapter.beginSession("session-1");
    await adapter.exchange("marker-1\nrequest", "marker-1", correlation());

    await expect(adapter.exchange("marker-1\nrequest", "marker-1", correlation())).rejects.toMatchObject({
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

    await expect(exchangeWithTrustedEnter(adapter, document, "marker-1\nrequest", "marker-1")).rejects.toMatchObject({
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

    await expect(exchangeWithTrustedEnter(adapter, document, "marker-1\nrequest", "marker-1")).resolves.toContain("split");
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
      "marker-en\nrequest",
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
    await exchangeWithTrustedEnter(adapter, document, "marker-1\nrequest", "marker-1");
    document.querySelector('[role="textbox"]')?.remove();

    const row = document.querySelector<HTMLElement>('[data-sidebar-chatgpt-conversation-key]')!;
    row.addEventListener("pointerdown", (event) => {
      if (event.target === row) document.body.insertAdjacentHTML("beforeend", '<div role="textbox" contenteditable="true"></div>');
    });

    await expect(adapter.exchange("marker-2\nrequest", "marker-2", correlation("session-1", "turn-2"))).resolves.toEqual({
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
      document.querySelector('[aria-label="返回"]')?.remove();
    });

    await expect(adapter.finishSession("session-1")).resolves.toBeUndefined();
  });
});
