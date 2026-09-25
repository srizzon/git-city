import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { LogoError, pixelize, sniffImage } from "./logo-image";

const solid = (w: number, h: number, format: "png" | "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 90 } } })[format]().toBuffer();

describe("pixelize", () => {
  it("turns a PNG or JPG into a 64×64 palette PNG", async () => {
    for (const f of ["png", "jpeg"] as const) {
      const out = await pixelize(new Uint8Array(await solid(400, 300, f)));
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe("png");
      expect([meta.width, meta.height]).toEqual([64, 64]);
      expect(meta.paletteBitDepth ?? meta.isPalette).toBeTruthy();
    }
  });

  it("keeps at most 16 colors", async () => {
    const noise = await sharp(Buffer.from(Array.from({ length: 128 * 128 * 3 }, (_, i) => (i * 97) % 256)), { raw: { width: 128, height: 128, channels: 3 } }).png().toBuffer();
    const { data, info } = await sharp(await pixelize(new Uint8Array(noise))).raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<string>();
    for (let i = 0; i < data.length; i += info.channels) colors.add(Array.from(data.subarray(i, i + info.channels)).join(","));
    expect(colors.size).toBeLessThanOrEqual(16);
  });

  it("refuses SVG, GIF, HTML and oversized files", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(pixelize(svg)).rejects.toBeInstanceOf(LogoError);
    await expect(pixelize(new TextEncoder().encode("GIF89a......"))).rejects.toThrow(/PNG or JPG/);
    await expect(pixelize(new Uint8Array(1024 * 1024 + 1))).rejects.toThrow(/1 MB/);
  });

  it("refuses a file that claims to be PNG but isn't", async () => {
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    await expect(pixelize(fake)).rejects.toThrow(/couldn't be read/);
  });

  it("sniffs by magic bytes, not the name", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg"))).toBeNull();
  });
});
