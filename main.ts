// Entry program for make.fun news-image-20261119 (variant 2).
// Copies the bundled front-page image to the output directory after
// checking it against the competition gate: PNG signature, at most
// 1024x1024 pixels, at most 1 MiB. The write is atomic (temp file
// plus rename) and the bytes written are hashed and compared with
// the source before the program reports success. Node 22 stdlib only.
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 1048576;
const MAX_DIMENSION = 1024;

function fail(message: string): never {
  throw new Error(`entry failed: ${message}`);
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

// Read the width and height out of the PNG IHDR chunk (bytes 16-23).
function pngDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < 24) fail("file too short to hold a PNG header");
  if (!data.subarray(0, 8).equals(PNG_MAGIC)) fail("not a PNG file");
  const chunkType = data.subarray(12, 16).toString("latin1");
  if (chunkType !== "IHDR") fail("first PNG chunk is not IHDR");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, "entry.png");
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const targetPath = join(outDir, "entry.png");

const image = readFileSync(sourcePath);
if (image.length > MAX_BYTES) {
  fail(`entry.png is ${image.length} bytes, over the 1 MiB limit`);
}
const { width, height } = pngDimensions(image);
if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
  fail(`image is ${width}x${height}, over the 1024x1024 limit`);
}
const sourceHash = sha256Hex(image);

mkdirSync(outDir, { recursive: true });
const tempPath = join(outDir, `.entry-${process.pid}.tmp`);
try {
  copyFileSync(sourcePath, tempPath);
  renameSync(tempPath, targetPath);
} catch (error) {
  try {
    rmSync(tempPath, { force: true });
  } catch {
    // best effort cleanup; the original error is what matters
  }
  fail(`could not write ${targetPath}: ${(error as Error).message}`);
}

const written = readFileSync(targetPath);
const writtenHash = sha256Hex(written);
if (writtenHash !== sourceHash) {
  fail("written file hash does not match the source image");
}
// Re-parse the written copy's header as well: the file on disk must
// still describe the same image the gate checks would see.
const writtenDims = pngDimensions(written);
if (writtenDims.width !== width || writtenDims.height !== height) {
  fail(
    `written file is ${writtenDims.width}x${writtenDims.height}, expected ${width}x${height}`,
  );
}
console.log(
  `wrote ${targetPath}: ${width}x${height} PNG, ${written.length} bytes, sha256 ${writtenHash}`,
);
