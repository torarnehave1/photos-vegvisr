import { isPdfKey, isVideoKey } from '../lib/media';

type MediaThumbProps = {
  url: string;
  /** Storage key; falls back to the URL when the item has none (trash entries). */
  mediaKey?: string;
  alt: string;
  className?: string;
};

/**
 * A still preview for a gallery tile. Images render as before; a video shows its first frame
 * with a play badge — playback itself happens in the viewer. A PDF shows a document card.
 */
const MediaThumb = ({ url, mediaKey, alt, className }: MediaThumbProps) => {
  if (isPdfKey(mediaKey || url)) {
    return (
      <span className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-white/10 text-white/80 ${className || ''}`} aria-label={alt}>
        <span className="material-symbols-rounded text-4xl">picture_as_pdf</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">PDF</span>
      </span>
    );
  }
  if (!isVideoKey(mediaKey || url)) {
    return <img src={url} alt={alt} className={className} loading="lazy" />;
  }
  return (
    <span className="relative block h-full w-full">
      <video
        src={`${url}#t=0.1`}
        aria-label={alt}
        className={className}
        muted
        playsInline
        preload="metadata"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="material-symbols-rounded rounded-full bg-black/50 p-1 text-3xl text-white">
          play_arrow
        </span>
      </span>
    </span>
  );
};

export default MediaThumb;
