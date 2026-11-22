import { describe, expect, it } from "vitest";
import type { DueStatus } from "@/lib/budget/metrics";
import { suggestions, totals, type SpaceSnapshot } from "@/lib/budget/overview";

const clear: DueStatus = { level: "clear", name: "", dueDay: null, days: null, overdueCount: 0, openCount: 0 };

const snap = (over: Partial<SpaceSnapshot> = {}): SpaceSnapshot => ({
  id: 1,
  name: "Home",
  started: true,
  accounts: 2,
  bankTotal: 100_00,
  cushion: 50_00,
  toPay: 30_00,
  incomeToArrive: 10_00,
  paidShare: 0.5,
  due: clear,
  ...over,
});

describe("totals", () => {
  it("adds up only the spaces whose month is started", () => {
    const t = totals([snap(), snap({ id: 2, cushion: -20_00, bankTotal: 5_00, toPay: 1_00, incomeToArrive: 2_00 }), snap({ id: 3, started: false, cushion: 999 })]);
    expect(t).toEqual({ spaces: 3, started: 2, cushion: 30_00, bankTotal: 105_00, toPay: 31_00, incomeToArrive: 12_00 });
  });
});

describe("suggestions", () => {
  it("has nothing to say when all is well", () => {
    expect(suggestions([snap()], "November 2026")).toEqual([]);
  });

  it("puts late bills before due-soon before housekeeping", () => {
    const list = suggestions(
      [
        snap({ id: 1, name: "A", started: false }),
        snap({ id: 2, name: "B", due: { level: "soon", name: "Water", dueDay: 22, days: 1, overdueCount: 0, openCount: 2 } }),
        snap({ id: 3, name: "C", due: { level: "overdue", name: "Tax", dueDay: 10, days: -4, overdueCount: 2, openCount: 3 } }),
      ],
      "November 2026",
    );
    expect(list.map((s) => [s.level, s.spaceId])).toEqual([["bad", 3], ["warn", 2], ["info", 1]]);
    expect(list[0].title).toContain("Tax and 1 other bill overdue");
    expect(list[1].title).toContain("due tomorrow");
    expect(list[2].title).toContain("November 2026 has not been started");
  });

  it("flags a negative cushion and a space with no accounts", () => {
    const list = suggestions([snap({ cushion: -12_50, accounts: 0 })], "November 2026");
    expect(list.map((s) => s.level)).toEqual(["bad", "info"]);
    expect(list[0].title).toContain("-$12.50");
  });

  it("caps the list", () => {
    const many = Array.from({ length: 10 }, (_, i) => snap({ id: i + 1, started: false }));
    expect(suggestions(many, "November 2026", 4)).toHaveLength(4);
  });
});

describe("suggestion priority", () => {
  it("keeps book order among equally urgent items, so the first books win the cap", () => {
    const list = suggestions([snap({ id: 5, name: "Home", started: false }), snap({ id: 2, name: "Invest", started: false }), snap({ id: 9, name: "Fun", started: false })], "November 2026", 2);
    expect(list.map((s) => s.spaceId)).toEqual([5, 2]);
  });
});
