import { describe, expect, it } from "vitest";
import { BALLOT_NUMBERS, FIRST_TERM, FIRST_VOTE, cantVote, electionClock, nextNumber, term, winner } from "./brasil-election";

const at = (iso: string) => Date.parse(iso);

describe("electionClock", () => {
  it("before the first vote: running for term 1, nobody in office", () => {
    const c = electionClock(at("2026-10-19T12:00:00Z"));
    expect(c.current).toBeNull();
    expect(c.next.n).toBe(1);
    expect(c.phase).toBe("candidacy");
  });
  it("the first vote: Friday 21h to Sunday 21h in Brasília", () => {
    expect(electionClock(FIRST_VOTE - 1).phase).toBe("candidacy");
    expect(electionClock(FIRST_VOTE).phase).toBe("voting");
    expect(electionClock(FIRST_TERM - 1).phase).toBe("voting");
  });
  it("term 1 runs four weeks; term 2's vote is its last week", () => {
    const c = electionClock(FIRST_TERM);
    expect(c.current?.n).toBe(1);
    expect(c.next.n).toBe(2);
    expect(c.phase).toBe("candidacy");
    expect(new Date(term(1).end).toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(new Date(term(2).opens).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(electionClock(term(2).opens).phase).toBe("voting");
  });
});

describe("winner", () => {
  it("most votes wins; a tie goes to whoever got there first", () => {
    expect(winner([{ candidate: 1, at: 5 }, { candidate: 2, at: 1 }, { candidate: 2, at: 2 }], new Set([1, 2]))).toBe(2);
    expect(winner([{ candidate: 1, at: 9 }, { candidate: 2, at: 3 }], new Set([1, 2]))).toBe(2);
  });
  it("votes for someone who withdrew don't count; no votes, no winner", () => {
    expect(winner([{ candidate: 1, at: 1 }, { candidate: 1, at: 2 }, { candidate: 2, at: 3 }], new Set([2]))).toBe(2);
    expect(winner([], new Set([1]))).toBeNull();
  });
});

describe("cantVote", () => {
  const voting = electionClock(FIRST_VOTE + 1000);
  it("on the map, an account a month old, while the vote is open", () => {
    expect(cantVote({ onMap: true, accountCreated: at("2020-01-01T00:00:00Z"), clock: voting })).toBeNull();
    expect(cantVote({ onMap: false, accountCreated: at("2020-01-01T00:00:00Z"), clock: voting })).toMatch(/map/);
    expect(cantVote({ onMap: true, accountCreated: at("2026-10-10T00:00:00Z"), clock: voting })).toMatch(/30 days/);
    expect(cantVote({ onMap: true, accountCreated: null, clock: electionClock(FIRST_VOTE - 1) })).toMatch(/isn't open/);
  });
});

describe("ballot numbers", () => {
  it("two digits from 31, never a party's", () => {
    expect(BALLOT_NUMBERS.every((n) => n >= 31 && n <= 99)).toBe(true);
    for (const party of [33, 35, 40, 45, 50, 55, 65]) expect(BALLOT_NUMBERS).not.toContain(party);
    expect(BALLOT_NUMBERS.length).toBeGreaterThan(40);
  });
  it("the lowest free one", () => {
    expect(nextNumber([])).toBe(31);
    expect(nextNumber([31, 32])).toBe(34);
    expect(nextNumber(BALLOT_NUMBERS)).toBeNull();
  });
});
