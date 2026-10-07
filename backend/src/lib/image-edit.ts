import sharp from "sharp";
import type { ImageEditPreset } from "../shared/edits.js";

export async function renderImageEdit(
  input: string,
  output: string,
  preset: ImageEditPreset,
): Promise<{ size: number; width: number; height: number }> {
  let pipeline = sharp(input).rotate();

  switch (preset) {
    case "compress":
      pipeline = pipeline
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 60 });
      break;
    case "grayscale":
      pipeline = pipeline
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .grayscale()
        .jpeg({ quality: 85 });
      break;
    case "contrast":
      pipeline = pipeline
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .linear(1.25, -32)
        .jpeg({ quality: 85 });
      break;
    case "square":
      pipeline = pipeline
        .resize(1080, 1080, { fit: "cover", position: "centre" })
        .jpeg({ quality: 85 });
      break;
    case "rotate":
      pipeline = pipeline.rotate(90).jpeg({ quality: 85 });
      break;
    case "jpeg":
      pipeline = pipeline
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 });
      break;
    case "webp":
      pipeline = pipeline
        .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 });
      break;
    default: {
      const neverPreset: never = preset;
      throw new Error(`unknown image preset ${String(neverPreset)}`);
    }
  }

  const info = await pipeline.toFile(output);
  return { size: info.size, width: info.width, height: info.height };
}
