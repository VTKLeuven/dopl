import { afterAll, describe, expect, it } from "vitest";
import { compareSortKeys, keyAfter, keyBefore } from "@dopl/shared";
import { createDbClient } from "./client";

const db = createDbClient({
  connectionString: process.env.DATABASE_URL ?? "",
  applicationName: "dopl-test",
  maxConnections: 2,
});
afterAll(() => db.$disconnect());

describe("sortKey columns (D-014)", () => {
  it("orders fractional keys in byte order in Postgres", async () => {
    const ws = await db.workspace.create({ data: { slug: `t-${crypto.randomUUID()}`, name: "t" } });
    let first = keyAfter(null);
    const keys = [first];
    for (let i = 0; i < 30; i++) {
      first = keyBefore(first);
      keys.unshift(first);
    }
    await db.label.createMany({
      data: keys.map((sortKey, i) => ({
        workspaceId: ws.id,
        name: `label ${i}`,
        color: "grey",
        sortKey,
      })),
    });
    const rows = await db.label.findMany({
      where: { workspaceId: ws.id },
      orderBy: { sortKey: "asc" },
      select: { sortKey: true },
    });
    expect(rows.map((r) => r.sortKey)).toEqual([...keys].sort(compareSortKeys));
  });
});
