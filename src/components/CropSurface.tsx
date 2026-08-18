import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export type AspectMode = 'free' | 'square';

export type CropHandle = {
  /**
   * The cropped region as a blob, or `null` when no crop is set — `null` means
   * "use the original bytes", it is not an error.
   */
  getCroppedBlob: (mimeType?: string, quality?: number) => Promise<Blob | null>;
  hasCrop: () => boolean;
};

type CropSurfaceProps = {
  src: string;
  alt: string;
  /** Needed to read pixels back from a cross-origin image (imgix sends ACAO: *). */
  crossOrigin?: 'anonymous' | 'use-credentials';
  disabled?: boolean;
  /** Tailwind max-height for the crop viewport, e.g. 'max-h-[45vh]'. */
  maxHeightClass?: string;
};

/** A centred crop of the given aspect, sized to the image's limiting dimension. */
const centredAspectCrop = (mediaWidth: number, mediaHeight: number, aspect: number): Crop =>
  centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );

/**
 * Cut `crop` (in *displayed* pixels) out of `image` at its natural resolution.
 * Any mirror was already baked in upstream, so no extra transform here.
 */
const cropToBlob = (
  image: HTMLImageElement,
  crop: PixelCrop,
  mimeType: string,
  quality: number,
  /** When the crop is aspect-locked, snap the output so rounding can't break the ratio. */
  lockedAspect?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width * scaleX));
    canvas.height = lockedAspect
      ? Math.max(1, Math.round(canvas.width / lockedAspect))
      : Math.max(1, Math.round(crop.height * scaleY));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not open a canvas to crop with.'));
      return;
    }
    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error(
                'Could not encode the cropped image. If this image is served without CORS headers the browser blocks reading it back.'
              )
            ),
      mimeType,
      quality
    );
  });

/**
 * Drag-to-crop over an image, with Free / Square / Full frame controls and a
 * natural-pixel readout. The parent pulls the result via the ref handle.
 */
export const CropSurface = forwardRef<CropHandle, CropSurfaceProps>(function CropSurface(
  { src, alt, crossOrigin, disabled, maxHeightClass = 'max-h-[45vh]' },
  ref
) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [aspectMode, setAspectMode] = useState<AspectMode>('free');
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  /**
   * Crop size in NATURAL pixels. Computed in the onComplete handler rather than
   * during render, because the display->natural scale comes from the <img> ref
   * and refs must not be read while rendering.
   */
  const [croppedSize, setCroppedSize] = useState<{ w: number; h: number } | null>(null);

  useImperativeHandle(ref, () => ({
    hasCrop: () => !!completedCrop && completedCrop.width >= 1 && completedCrop.height >= 1,
    getCroppedBlob: async (mimeType = 'image/jpeg', quality = 0.92) => {
      const image = imgRef.current;
      if (!image || !completedCrop || completedCrop.width < 1 || completedCrop.height < 1) {
        return null;
      }
      return cropToBlob(
        image,
        completedCrop,
        mimeType,
        quality,
        aspectMode === 'square' ? 1 : undefined
      );
    },
  }));

  /** Switch aspect. Square drops a centred 1:1 box; Free keeps whatever is drawn. */
  const applyAspect = (mode: AspectMode) => {
    setAspectMode(mode);
    const image = imgRef.current;
    if (mode === 'square' && image) {
      const next = centredAspectCrop(image.width, image.height, 1);
      const px: PixelCrop = {
        unit: 'px',
        x: ((next.x as number) / 100) * image.width,
        y: ((next.y as number) / 100) * image.height,
        width: ((next.width as number) / 100) * image.width,
        height: ((next.height as number) / 100) * image.height,
      };
      setCrop(next);
      setCompletedCrop(px);
      const squareW = Math.round((px.width * image.naturalWidth) / image.width);
      setCroppedSize({ w: squareW, h: squareW });
    }
  };

  const clearCrop = () => {
    setAspectMode('free');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCroppedSize(null);
  };

  const outputSize = croppedSize
    ? { ...croppedSize, cropped: true }
    : naturalSize
      ? { ...naturalSize, cropped: false }
      : null;

  const btn = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
      active ? 'bg-sky-500/40 text-white' : 'border border-white/10 text-white/70 hover:bg-white/10'
    }`;

  return (
    <div className="grid gap-3">
      <div className={`flex ${maxHeightClass} justify-center overflow-auto bg-black`}>
        <ReactCrop
          crop={crop}
          onChange={(_px, percentCrop) => setCrop(percentCrop)}
          onComplete={(pixelCrop) => {
            setCompletedCrop(pixelCrop);
            const image = imgRef.current;
            if (!image || !image.width || pixelCrop.width < 1 || pixelCrop.height < 1) {
              setCroppedSize(null);
              return;
            }
            const w = Math.round((pixelCrop.width * image.naturalWidth) / image.width);
            setCroppedSize({
              w,
              h:
                aspectMode === 'square'
                  ? w
                  : Math.round((pixelCrop.height * image.naturalHeight) / image.height),
            });
          }}
          aspect={aspectMode === 'square' ? 1 : undefined}
          disabled={disabled}
          className={maxHeightClass}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            crossOrigin={crossOrigin}
            onLoad={(event) =>
              setNaturalSize({
                w: event.currentTarget.naturalWidth,
                h: event.currentTarget.naturalHeight,
              })
            }
            className={`${maxHeightClass} w-auto`}
          />
        </ReactCrop>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Crop</span>
        <button
          type="button"
          onClick={() => applyAspect('free')}
          disabled={disabled}
          className={btn(aspectMode === 'free')}
        >
          Free
        </button>
        <button
          type="button"
          onClick={() => applyAspect('square')}
          disabled={disabled}
          className={btn(aspectMode === 'square')}
        >
          Square
        </button>
        <button
          type="button"
          onClick={clearCrop}
          disabled={disabled || !completedCrop}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
        >
          Full frame
        </button>
        {outputSize && (
          <span className="text-xs text-white/45">
            {outputSize.cropped ? 'Cropped to' : 'Full frame'} {outputSize.w}×{outputSize.h}
          </span>
        )}
      </div>
      <p className="text-xs text-white/45">
        Drag on the photo to draw a crop. Free lets you drag any shape; Square locks it to 1:1.
        Nothing is cropped until you drag.
      </p>
    </div>
  );
});
