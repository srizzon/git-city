import sharp from "sharp";
import { LOGO_COLORS, LOGO_MAX_BYTES, LOGO_SIZE } from "./identity";

// Every logo, uploaded or fetched from the GitHub org, is re-encoded here:
// downsized to 64×64 and quantized to a 16-color palette (libimagequant), so
// it reads as pixel art and nothing but pixels reaches the bucket. PNG and
// JPG only, never SVG (scripts).

export class LogoError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** PNG or JPEG by magic bytes; everything else (SVG, GIF, HTML) is refused. */
export function sniffImage(buf: Uint8Array): "png" | "jpeg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  return null;
}

/** The pixelized logo as a palette PNG. Throws LogoError on bad input. */
export async function pixelize(input: Uint8Array): Promise<Buffer> {
  if (input.byteLength > LOGO_MAX_BYTES) throw new LogoError("Logos can be up to 1 MB.");
  if (!sniffImage(input)) throw new LogoError("Use a PNG or JPG image.");
  try {
    return await sharp(input, { limitInputPixels: 4096 * 4096, failOn: "error" })
      .rotate()
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ palette: true, colors: LOGO_COLORS })
      .toBuffer();
  } catch {
    throw new LogoError("That image couldn't be read.");
  }
}

