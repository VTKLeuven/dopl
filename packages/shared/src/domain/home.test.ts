import { describe, expect, it } from "vitest";
import { HOME_CHARTS, HOME_MAX_WIDGETS, HomeLayoutSchema, type HomeLayout } from "../schemas/home";
import { WORKSPACE_DASHBOARD } from "./dashboards";
import {
  addWidget,
  canAdd,
  DEFAULT_HOME_LAYOUT,
  homeChart,
  layoutProblem,
  moveWidget,
  parseHomeLayout,
  removeWidget,
  shiftWidget,
  todayAgenda,
  widgetsIn,
} from "./home";

const ids = (layout: HomeLayout, zone?: "top" | "main" | "side") =>
  (zone ? widgetsIn(layout, zone) : layout.widgets).map((w) => w.id);

describe("default home layout", () => {
  it("is a valid layout: notes in the main column, today's work on the side", () => {
    expect(HomeLayoutSchema.parse(DEFAULT_HOME_LAYOUT)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(layoutProblem(DEFAULT_HOME_LAYOUT)).toBeNull();
    expect(ids(DEFAULT_HOME_LAYOUT, "main")).toEqual(["pinned", "recent"]);
    expect(ids(DEFAULT_HOME_LAYOUT, "side")).toEqual(["today", "review", "todos", "inbox"]);
    expect(ids(DEFAULT_HOME_LAYOUT, "top")).toEqual([]);
  });

  it("every chart a widget can show is one of the workspace dashboard's charts", () => {
    const keys = new Set(WORKSPACE_DASHBOARD.map((w) => w.key));
    for (const key of HOME_CHARTS) {
      expect(keys.has(key)).toBe(true);
      expect(homeChart(key).key).toBe(key);
    }
  });
});

describe("parsing a stored layout", () => {
  it("falls back to the default when nothing usable is stored", () => {
    expect(parseHomeLayout(undefined)).toBeNull();
    expect(parseHomeLayout({})).toBeNull();
    expect(parseHomeLayout({ widgets: "nope" })).toBeNull();
  });

  it("keeps an empty layout empty (the member removed everything)", () => {
    expect(parseHomeLayout({ widgets: [] })).toEqual({ widgets: [] });
  });

  it("drops widgets that don't parse, one by one, and keeps the rest in order", () => {
    const parsed = parseHomeLayout({
      widgets: [
        { id: "a", type: "todos", zone: "side" },
        { id: "b", type: "gone-in-a-later-version", zone: "main" },
        { id: "c", type: "view", zone: "main", viewId: "not-a-uuid" },
        { id: "d", type: "taggedNotes", zone: "main", tag: "Infra/Proxmox", count: 6 },
      ],
    });
    expect(parsed?.widgets).toEqual([
      { id: "a", type: "todos", zone: "side" },
      { id: "d", type: "taggedNotes", zone: "main", tag: "infra/proxmox", count: 6 },
    ]);
  });

  it("drops a second copy of a one-off widget and of an id, but keeps repeatable ones", () => {
    const parsed = parseHomeLayout({
      widgets: [
        { id: "a", type: "inbox", zone: "side" },
        { id: "b", type: "inbox", zone: "main" },
        { id: "a", type: "todos", zone: "side" },
        { id: "c", type: "chart", zone: "top", chart: "open", range: "90d" },
        { id: "d", type: "chart", zone: "top", chart: "flow", range: "30d" },
      ],
    });
    expect(parsed ? ids(parsed) : null).toEqual(["a", "c", "d"]);
  });

  it("caps the number of widgets", () => {
    const widgets = Array.from({ length: HOME_MAX_WIDGETS + 5 }, (_, i) => ({
      id: `t${i}`,
      type: "taggedNotes",
      zone: "main",
      tag: `tag${i}`,
      count: 4,
    }));
    expect(parseHomeLayout({ widgets })?.widgets).toHaveLength(HOME_MAX_WIDGETS);
  });
});

describe("saving rules", () => {
  it("refuses duplicate ids and a second one-off widget", () => {
    const todos = { id: "x", type: "todos", zone: "side" } as const;
    expect(layoutProblem({ widgets: [todos, { ...todos, type: "inbox" }] })).toBe("duplicate_id");
    expect(layoutProblem({ widgets: [todos, { ...todos, id: "y" }] })).toBe("duplicate_widget");
  });

  it("offers a one-off widget only while it isn't on the page", () => {
    expect(canAdd(DEFAULT_HOME_LAYOUT, "todos")).toBe(false);
    expect(canAdd(DEFAULT_HOME_LAYOUT, "week")).toBe(true);
    expect(canAdd(DEFAULT_HOME_LAYOUT, "chart")).toBe(true);
    expect(canAdd(removeWidget(DEFAULT_HOME_LAYOUT, "todos"), "todos")).toBe(true);
  });
});

describe("moving widgets", () => {
  const layout = DEFAULT_HOME_LAYOUT;

  it("reorders within a column", () => {
    const next = moveWidget(layout, "inbox", "side", 0);
    expect(ids(next, "side")).toEqual(["inbox", "today", "review", "todos"]);
    expect(ids(moveWidget(layout, "today", "side", 2), "side")).toEqual([
      "review",
      "todos",
      "today",
      "inbox",
    ]);
  });

  it("moves to another zone at the given place, or to its end", () => {
    const next = moveWidget(layout, "todos", "main", 1);
    expect(ids(next, "main")).toEqual(["pinned", "todos", "recent"]);
    expect(ids(next, "side")).toEqual(["today", "review", "inbox"]);
    expect(ids(moveWidget(layout, "todos", "main", 99), "main")).toEqual([
      "pinned",
      "recent",
      "todos",
    ]);
  });

  it("moves into an empty zone", () => {
    const next = moveWidget(layout, "inbox", "top", 0);
    expect(ids(next, "top")).toEqual(["inbox"]);
    expect(next.widgets.find((w) => w.id === "inbox")?.zone).toBe("top");
  });

  it("shifts one step and stops at the ends", () => {
    expect(ids(shiftWidget(layout, "review", -1), "side")).toEqual([
      "review",
      "today",
      "todos",
      "inbox",
    ]);
    expect(shiftWidget(layout, "today", -1)).toBe(layout);
    expect(shiftWidget(layout, "inbox", 1)).toBe(layout);
  });

  it("adds at the end of a zone", () => {
    const next = addWidget(layout, { id: "w", type: "week", zone: "top" });
    expect(ids(next, "top")).toEqual(["w"]);
    expect(ids(next, "side")).toEqual(ids(layout, "side"));
  });
});

describe("today agenda", () => {
  const today = "2026-10-07"; // a Wednesday
  const weekEnd = "2026-10-11";
  const item = (
    id: string,
    dueDate: string | null,
    extra: Partial<Record<string, string>> = {},
  ) => ({
    id,
    dueDate,
    stateGroup: (extra.stateGroup ?? "UNSTARTED") as "UNSTARTED" | "STARTED",
    priority: (extra.priority ?? "NONE") as "NONE" | "HIGH" | "URGENT",
  });
  const todo = (id: string, dueDate: string | null, checked = false) => ({ id, dueDate, checked });
  const noTodos: Array<ReturnType<typeof todo>> = [];

  it("orders overdue, today, the rest of the week, then in progress", () => {
    const entries = todayAgenda(
      [
        item("started", null, { stateGroup: "STARTED" }),
        item("friday", "2026-10-09"),
        item("today", today),
        item("late", "2026-10-01"),
        item("thursday", "2026-10-08"),
      ],
      noTodos,
      today,
      weekEnd,
    );
    expect(entries.map((e) => (e.kind === "item" ? e.item.id : e.todo.id))).toEqual([
      "late",
      "today",
      "thursday",
      "friday",
      "started",
    ]);
    expect(entries[0]?.when).toEqual({ kind: "overdue", date: "2026-10-01" });
    expect(entries[2]?.when).toEqual({ kind: "week", date: "2026-10-08" });
  });

  it("leaves out work due after this week and unstarted work without a date", () => {
    const entries = todayAgenda(
      [item("next-week", "2026-10-14"), item("someday", null)],
      [todo("later", "2026-10-20"), todo("undated", null)],
      today,
      weekEnd,
    );
    expect(entries).toEqual([]);
  });

  it("keeps started work due later as in progress", () => {
    const entries = todayAgenda(
      [item("big", "2026-11-01", { stateGroup: "STARTED" })],
      noTodos,
      today,
      weekEnd,
    );
    expect(entries[0]?.when).toEqual({ kind: "inProgress" });
  });

  it("puts items before to-dos on the same day, higher priority first", () => {
    const entries = todayAgenda(
      [item("low", today), item("urgent", today, { priority: "URGENT" })],
      [todo("call", today), todo("done", today, true)],
      today,
      weekEnd,
    );
    expect(entries.map((e) => (e.kind === "item" ? e.item.id : e.todo.id))).toEqual([
      "urgent",
      "low",
      "call",
    ]);
  });
});
