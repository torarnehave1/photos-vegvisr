import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

// pdf.js needs a worker. Wire the Vite-bundled worker once at module load.
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export type ExtractedPdfImage = {
  /** Stable id within this extraction run (object name or synthetic inline id). */
  id: string;
  blob: Blob;
  width: number;
  height: number;
  /** 1-based page the image first appears on. */
  pageNumber: number;
  /** Object URL for previewing in the review grid. Caller revokes when done. */
  previewUrl: string;
};

type RawImage = {
  width: number;
  height: number;
  // In the browser pdf.js decodes to an ImageBitmap; in non-DOM runtimes it
  // returns raw pixels + kind. Either may be present.
  bitmap?: ImageBitmap | null;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray | null;
};

const { GRAYSCALE_1BPP, RGB_24BPP, RGBA_32BPP } = pdfjsLib.ImageKind;

/** Convert pdf.js raw image data (any ImageKind) into RGBA suitable for ImageData. */
const toRgba = (width: number, height: number, kind: number | undefined, data: Uint8Array | Uint8ClampedArray): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(width * height * 4);

  if (kind === RGBA_32BPP) {
    out.set(data.subarray(0, out.length));
    return out;
  }

  if (kind === RGB_24BPP) {
    for (let i = 0, o = 0; i < data.length; i += 3, o += 4) {
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
      out[o + 3] = 255;
    }
    return out;
  }

  if (kind === GRAYSCALE_1BPP) {
    // 1 bit per pixel, rows padded to whole bytes.
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = data[y * rowBytes + (x >> 3)];
        const bit = (byte >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const o = (y * width + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  throw new Error(`Unsupported PDF image kind: ${kind}`);
};

const rawImageToPngBlob = async (img: RawImage): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const imageData = ctx.createImageData(img.width, img.height);
    imageData.data.set(toRgba(img.width, img.height, img.kind, img.data));
    ctx.putImageData(imageData, 0, 0);
  } else {
    throw new Error('PDF image has no pixel data.');
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Failed to encode extracted image.');
  return blob;
};

const resolveObj = (page: pdfjsLib.PDFPageProxy, name: string): Promise<RawImage | null> =>
  new Promise((resolve) => {
    try {
      page.objs.get(name, (obj: RawImage) => resolve(obj ?? null));
    } catch {
      resolve(null);
    }
  });

/**
 * Extract the embedded raster images from a PDF, in document order, deduped by
 * object so a repeated logo yields one image. Stencil masks are skipped.
 */
export const extractPdfImages = async (file: File): Promise<ExtractedPdfImage[]> => {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const doc = await loadingTask.promise;
  const { OPS } = pdfjsLib;

  const seen = new Set<string>();
  const results: ExtractedPdfImage[] = [];

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();

      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        let raw: RawImage | null = null;
        let id = '';

        if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
          const name = ops.argsArray[i][0] as string;
          if (seen.has(name)) continue;
          seen.add(name);
          id = name;
          raw = await resolveObj(page, name);
        } else if (fn === OPS.paintInlineImageXObject) {
          // Inline image object is passed directly, not by name.
          id = `inline_p${p}_${i}`;
          raw = ops.argsArray[i][0] as RawImage;
        }

        if (!raw || !raw.width || !raw.height || (!raw.bitmap && !raw.data)) continue;

        const blob = await rawImageToPngBlob(raw);
        results.push({
          id,
          blob,
          width: raw.width,
          height: raw.height,
          pageNumber: p,
          previewUrl: URL.createObjectURL(blob),
        });
      }

      page.cleanup();
    }
  } finally {
    await doc.cleanup();
    await loadingTask.destroy();
  }

  return results;
};

/** Build an upload-ready File from an extracted image. */
export const extractedImageToFile = (
  img: ExtractedPdfImage,
  baseName: string
): File => new File([img.blob], `${baseName}.png`, { type: 'image/png' });
