import { expect, it } from "vitest";
import { BackgroundSession, type BackgroundChatPort } from "../packages/renderer-plugin/src/background-session.js";
import { ChatConfiguration } from "../packages/renderer-plugin/src/chat-configuration.js";
import { PROTOCOL } from "../packages/renderer-plugin/src/protocol.js";

function fixture() {
  let now = 0;
  const sent: string[] = [];
  const reads: number[] = [];
  let source: string | null = null;
  const config = new ChatConfiguration();
  config.updateCatalog({ options: [{ slug: "planner", lane: "pro", modelTitle: "Planner", selectedLabel: "Pro" }] });
  const task = { hostId: "local", taskId: "task" };
  config.updateTask(task, { enabled: true, modelKey: config.models()[0]!.key });
  const port: BackgroundChatPort = {
    check: async () => {},
    send: async input => { sent.push(input.text); return `message-${sent.length}`; },
    read: async (_id, window) => { reads.push(window); now += window; return source === null ? { state: "waiting" } : { state: "complete", text: source }; },
    finish: async () => {},
  };
  const session = new BackgroundSession("session", config.freeze(task, "snapshot"), port, () => now);
  const request = { protocol: PROTOCOL, sessionId: "session", turnId: "turn-1", kind: "request", objective: "Produce a document", state: { phase: "investigate", summary: "Inspect requirements", completed: [], blockers: [] }, message: "Plan the work", actionResults: [] };
  return { session, request, sent, reads, port, task,
    raw(text: string) { source = text; },
    advance(ms: number) { now += ms; },
    reply(turnId = "turn-1") { source = '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, sessionId: "session", turnId, status: "continue", summary: "Check the source", actions: [{ id: "a1", type: "inspect", instruction: "Read the source", expectedResult: "Report its constraints" }] }) + '\n```'; },
  };
}

it("ends a pending read without CALL_BUSY, suppresses late actions, and coalesces repeated cleanup", async () => {
  const f = fixture();
  let reading!: () => void;
  const started = new Promise<void>(resolve => { reading = resolve; });
  f.port.read = async (_id, _window, signal) => {
    reading();
    await new Promise<void>(resolve => signal!.addEventListener("abort", () => resolve(), { once: true }));
    return { state: "complete", text: "Bridge status: complete\nLate response" };
  };
  let finishes = 0;
  f.port.finish = async () => { finishes++; };
  const pending = f.session.exchange(f.request).catch(error => error);
  await started;
  await Promise.all([f.session.finish("retain"), f.session.finish("retain")]);
  expect(await pending).toMatchObject({ code: "SESSION_ENDING" });
  expect(finishes).toBe(1);
  expect(f.sent).toHaveLength(1);
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "SESSION_LOST" });
});

it("sends once across short read windows and requires explicit continuation after the total deadline", async () => {
  const f = fixture();
  expect((await f.session.exchange(f.request)).state).toBe("waiting");
  f.advance(14 * 60_000);
  expect((await f.session.exchange(f.request)).state).toBe("paused");
  f.reply();
  expect((await f.session.exchange(f.request)).state).toBe("paused");
  expect(f.sent).toHaveLength(1);
  expect(f.reads).toEqual([90_000]);
  f.session.continueWaiting();
  expect((await f.session.exchange(f.request)).state).toBe("response");
  expect(f.sent).toHaveLength(1);
  expect((await f.session.exchange(f.request)).state).toBe("already-delivered");
});

it("performs only one format repair and disabling prevents repair sends", async () => {
  const f = fixture();
  f.raw("invalid");
  expect((await f.session.exchange(f.request)).state).toBe("repair-required");
  f.session.setEnabled(false);
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "COLLABORATION_DISABLED" });
  expect(f.sent).toHaveLength(1);
  f.session.setEnabled(true);
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "PROTOCOL_INVALID" });
  expect(f.sent).toHaveLength(2);
});

it("repairs an invalid legacy reply by requesting one readable status and the original plan", async () => {
  const f=fixture();
  f.raw('```codex-bridge-response-v1\n'+JSON.stringify({protocol:PROTOCOL,sessionId:"session",turnId:"turn-1",status:"continue",summary:"Research plan",actions:[{id:"a1",type:"unknown_operation",instruction:"Check public evidence",expectedResult:"Cited findings"}]})+'\n```');
  expect((await f.session.exchange(f.request)).state).toBe("repair-required");
  f.reply();
  expect((await f.session.exchange(f.request)).state).toBe("response");
  expect(f.sent[1]).toContain("唯一一次格式澄清");
  expect(f.sent[0]).toContain("协作状态：继续");
  expect(f.sent[1]).toContain("协作状态：建议完成");
  expect(f.sent).toHaveLength(2);
});

it("exposes a recoverable repair state and reads the same repaired turn without resending business work", async () => {
  const f = fixture(); f.raw("not a protocol block");
  expect((await f.session.exchange(f.request)).state).toBe("repair-required");
  expect(f.session.status()).toMatchObject({state:"repair-required",busy:false,usedRounds:1,repair:"required"});
  f.reply();
  expect((await f.session.exchange(f.request)).state).toBe("response");
  expect(f.sent).toHaveLength(2);
  expect(f.session.status()).toMatchObject({state:"actions-returned",usedRounds:1});
  expect((await f.session.exchange(f.request)).state).toBe("already-delivered");
  expect(f.sent).toHaveLength(2);
});

it("enforces batch budget without counting reads and allows another batch only through explicit consent", async () => {
  const f = fixture();
  for (let i = 1; i <= 3; i++) {
    f.reply(`turn-${i}`);
    await f.session.exchange({ ...f.request, turnId: `turn-${i}`, ...(i === 1 ? {} : { kind: "result", actionResults: [{ actionId: "a1", outcome: "succeeded", summary: "Checked", evidence: ["Verified source"] }] }) }, i === 1 ? undefined : `turn-${i - 1}`);
  }
  const next = { ...f.request, turnId: "turn-4", kind: "result", actionResults: [{ actionId: "a1", outcome: "succeeded", summary: "Checked", evidence: ["Verified source"] }] };
  await expect(f.session.exchange(next, "turn-3")).rejects.toMatchObject({ code: "BUDGET_EXHAUSTED" });
  expect(f.sent).toHaveLength(3);
  f.session.allowNextBatch();
  f.reply("turn-4");
  expect((await f.session.exchange(next, "turn-3")).state).toBe("response");
});

it("rejects unrelated, missing or duplicate action results before sending another turn", async () => {
  const f = fixture();
  f.reply();
  await f.session.exchange(f.request);
  const result = { actionId: "a1", outcome: "succeeded", summary: "Checked", evidence: ["source"] };
  for (const results of [[], [result, result], [{ ...result, actionId: "unknown" }]]) {
    await expect(f.session.exchange({ ...f.request, kind: "result", turnId: "turn-2", actionResults: results }, "turn-1")).rejects.toMatchObject({ code: "ACTION_RESULTS_INVALID" });
  }
  expect(f.sent).toHaveLength(1);
});

it("stops permanently on uncertain send, but retains the cleanup target when deletion fails", async () => {
  const f = fixture();
  let sends = 0;
  f.port.send = async () => { sends++; throw Error("private details"); };
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "SEND_UNCERTAIN" });
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "SEND_UNCERTAIN" });
  expect(sends).toBe(1);
  let finishes = 0;
  f.port.finish = async () => { finishes++; if (finishes === 1) throw Error("private details"); };
  await expect(f.session.finish("delete")).rejects.toMatchObject({ code: "CLEANUP_FAILED" });
  await f.session.finish("retain");
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "SESSION_LOST" });
});

it("keeps a late reply private until consent, then uses it without rereading or resending", async () => {
  const f = fixture();
  let reads = 0;
  f.port.read = async () => {
    reads++;
    f.advance(15 * 60_000);
    return { state: "complete", text: '```codex-bridge-response-v1\n' + JSON.stringify({ protocol: PROTOCOL, sessionId: "session", turnId: "turn-1", status: "complete", summary: "Planner suggests completion, not verified delivery", actions: [] }) + '\n```' };
  };
  expect((await f.session.exchange(f.request)).state).toBe("paused");
  expect((await f.session.exchange(f.request)).state).toBe("paused");
  f.session.continueWaiting();
  const result = await f.session.exchange(f.request);
  expect(result.state).toBe("response");
  expect(result).not.toHaveProperty("finished");
  expect(reads).toBe(1);
  expect(f.sent).toHaveLength(1);
});

it("treats a terminal adapter error as terminal rather than another waiting window", async () => {
  const f = fixture();
  f.port.read = async () => { throw Error("private network details"); };
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "BACKGROUND_FAILED" });
  await expect(f.session.exchange(f.request)).rejects.toMatchObject({ code: "BACKGROUND_FAILED" });
  expect(f.sent).toHaveLength(1);
});

it("cannot change a pending turn or start a competing turn", async () => {
  const f = fixture();
  await f.session.exchange(f.request);
  await expect(f.session.exchange({ ...f.request, message: "changed" })).rejects.toMatchObject({ code: "TURN_CONFLICT" });
  await expect(f.session.exchange({ ...f.request, turnId: "competing" })).rejects.toMatchObject({ code: "TURN_PENDING" });
  expect(f.sent).toHaveLength(1);
});

it("shows deadline pause and permits explicit continuation even when no caller read at the deadline", async () => {
  const f = fixture(); await f.session.exchange(f.request);
  f.advance(15 * 60_000);
  expect(f.session.status().state).toBe("paused");
  f.session.continueWaiting();
  f.reply();
  expect((await f.session.exchange(f.request)).state).toBe("response");
  expect(f.sent).toHaveLength(1);
});

it("readback never sends or repairs, reveals raw invalid text, or releases late replies without consent", async () => {
  const f = fixture(); f.raw("private invalid response");
  await f.session.exchange(f.request);
  expect(f.session.readTurn("turn-1")).toEqual({ state:"repair-required", turnId:"turn-1" });
  expect(f.sent).toHaveLength(1);
  f.session.setEnabled(false);
  expect(f.session.readTurn("turn-1").state).toBe("disabled");
  f.session.setEnabled(true);
  f.advance(15 * 60_000);
  f.reply();
  expect(f.session.readTurn("turn-1").state).toBe("paused");
  expect(f.session.readTurn("turn-1")).not.toHaveProperty("response");
  expect(f.sent).toHaveLength(1);
  expect(f.reads).toHaveLength(1);
});

it("readback clones validated responses and does not claim that Codex verified them", async () => {
  const f = fixture(); f.reply(); await f.session.exchange(f.request);
  const result=f.session.readTurn("turn-1");
  if(result.state !== "response") throw Error("Missing cached reply");
  result.response.actions[0]!.instruction="mutated caller copy";
  expect(f.session.readTurn("turn-1")).toMatchObject({state:"response",response:{actions:[{instruction:"Read the source"}]}});
  expect(f.session.hasCompletedReport()).toBe(false);
  expect(f.sent).toHaveLength(1);
  f.session.stop();
  expect(()=>f.session.readTurn("turn-1")).toThrow();
});
