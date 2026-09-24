import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveQueue, type SendOutcome } from "./queue";

function setup(outcomes: SendOutcome[]) {
  let work = 0;
  const statuses: string[] = [];
  const sendNext = vi.fn(async () => {
    const o = outcomes.shift() ?? "ok";
    if (o === "ok") work = Math.max(0, work - 1);
    return o;
  });
  const q = createSaveQueue({ hasWork: () => work > 0, sendNext, onStatus: (s) => statuses.push(s) });
  return { q, sendNext, statuses, add: (n = 1) => { work += n; q.changed(); }, work: () => work };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("save queue", () => {
  it("debounces edits by 500 ms", async () => {
    const t = setup([]);
    t.add();
    await vi.advanceTimersByTimeAsync(300);
    t.q.changed(); // another edit re-arms the wait
    await vi.advanceTimersByTimeAsync(300);
    expect(t.sendNext).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(t.sendNext).toHaveBeenCalledTimes(1);
  });

  it("sends batches one after another until drained, then reports saved", async () => {
    const t = setup([]);
    t.add(3);
    await vi.advanceTimersByTimeAsync(600);
    expect(t.sendNext).toHaveBeenCalledTimes(3);
    expect(t.statuses).toEqual(["saving", "saved"]);
  });

  it("backs off 2, 5, 10 s, goes offline, then recovers to saved", async () => {
    const t = setup(["retry", "retry", "retry", "retry", "ok"]);
    t.add();
    await vi.advanceTimersByTimeAsync(500);
    expect(t.sendNext).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(t.sendNext).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.sendNext).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.sendNext).toHaveBeenCalledTimes(3);
    expect(t.q.status()).toBe("offline");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.sendNext).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.sendNext).toHaveBeenCalledTimes(5);
    expect(t.q.status()).toBe("saved");
  });

  it("never runs two batches at once", async () => {
    let release: (o: SendOutcome) => void = () => {};
    let inFlight = 0;
    let maxInFlight = 0;
    let work = 2;
    const q = createSaveQueue({
      hasWork: () => work > 0,
      sendNext: () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<SendOutcome>((r) => (release = (o) => { inFlight--; work--; r(o); }));
      },
      onStatus: () => {},
    });
    q.changed();
    await vi.advanceTimersByTimeAsync(500);
    q.flush();
    q.changed();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(maxInFlight).toBe(1);
    release("ok");
    await vi.advanceTimersByTimeAsync(10);
    release("ok");
    await vi.advanceTimersByTimeAsync(10);
    expect(maxInFlight).toBe(1);
  });

  it("stops on a fatal outcome", async () => {
    const t = setup(["fatal"]);
    t.add(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(t.sendNext).toHaveBeenCalledTimes(1);
    expect(t.q.status()).toBe("error");
  });

  it("flush skips the debounce, and drained resolves when done", async () => {
    const t = setup([]);
    t.add();
    const done = t.q.drained();
    t.q.flush();
    await vi.advanceTimersByTimeAsync(0);
    await expect(done).resolves.toBeUndefined();
    expect(t.work()).toBe(0);
  });
});
