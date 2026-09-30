import { describe, expect, it } from "vitest";
import { AVATAR_FILE_RE, sniffAvatarType } from "./avatar";

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);

describe("sniffAvatarType", () => {
  it("recognises the raster formats by their magic bytes", () => {
    expect(sniffAvatarType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png");
    expect(sniffAvatarType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffAvatarType(ascii("GIF89a..."))).toBe("gif");
    expect(sniffAvatarType(ascii("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("webp");
  });

  it("refuses everything else, whatever it claims to be", () => {
    expect(sniffAvatarType(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffAvatarType(ascii("<!doctype html>"))).toBeNull();
    expect(sniffAvatarType(ascii("RIFF\x10\x00\x00\x00WAVE"))).toBeNull();
    expect(sniffAvatarType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffAvatarType(bytes())).toBeNull();
  });
});

describe("AVATAR_FILE_RE", () => {
  it("only matches a uuid with a known extension", () => {
    expect(AVATAR_FILE_RE.test("0192f0c1-2b3c-7d4e-8f90-a1b2c3d4e5f6.png")).toBe(true);
    expect(AVATAR_FILE_RE.test("0192f0c1-2b3c-7d4e-8f90-a1b2c3d4e5f6.svg")).toBe(false);
    expect(AVATAR_FILE_RE.test("../0192f0c1-2b3c-7d4e-8f90-a1b2c3d4e5f6.png")).toBe(false);
  });
});
