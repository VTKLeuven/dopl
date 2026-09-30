import { describe, expect, it } from "vitest";
import { originList } from "./env";

describe("originList", () => {
  it("is empty when unset or blank", () => {
    expect(originList.parse(undefined)).toEqual([]);
    expect(originList.parse(" , ")).toEqual([]);
  });

  it("reduces each entry to its origin and drops duplicates", () => {
    expect(
      originList.parse("https://vtk.be/api/auth/better, https://vtk.be/ ,http://localhost:4000"),
    ).toEqual(["https://vtk.be", "http://localhost:4000"]);
  });

  it("rejects wildcards, bare hosts and other schemes", () => {
    for (const bad of ["https://*.vtk.be", "vtk.be", "myapp://callback", "*"]) {
      expect(originList.safeParse(bad).success, bad).toBe(false);
    }
  });
});
