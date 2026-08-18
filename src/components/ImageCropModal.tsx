import { useRef, useState } from 'react';
import { CropSurface, type CropHandle } from './CropSurface';

export type CropTarget = {
  /** R2 key, e.g. "1743532765979.png". */
  key: string;
  url: string;
  label: string;
};

type ImageCropModalProps = {
  target: CropTarget;
  /** Album the "save as new" copy is added to. Empty string = library only. */
  albumName: string;
  /** How many albums currently reference this key — shown before an overwrite. */
  referencingAlbums: string[];
  saving: boolean;
  status: string;
  error: string;
  onClose: () => void;
  onSaveAsNew: (blob: Blob, name: string) => Promise<void>;
  onReplaceOriginal: (blob: Blob, filenameBase: string, extension: string) => Promise<void>;
};

/**
 * Re-encoding rules. To overwrite an R2 object in place the new key must match
 * the old one exactly, and the worker builds the key as `{filename}.{ext}` from
 * the uploaded file — so a PNG original must be re-encoded as PNG, not JPEG.
 * Formats the canvas cannot re-encode losslessly are blocked from replacing.
 */
const ENCODERS: Record<string, { mime: string; quality: number }> = {
  png: { mime: 'image/png', quality: 1 },
  jpg: { mime: 'image/jpeg', quality: 0.92 },
  jpeg: { mime: 'image/jpeg', quality: 0.92 },
  webp: { mime: 'image/webp', quality: 0.92 },
};

const extensionOf = (key: string) => {
  const match = key.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

const baseNameOf = (key: string) => key.replace(/\.[^.]+$/, '');

export function ImageCropModal({
  target,
  albumName,
  referencingAlbums,
  saving,
  status,
  error,
  onClose,
  onSaveAsNew,
  onReplaceOriginal,
}: ImageCropModalProps) {
  const cropRef = useRef<CropHandle | null>(null);
  const [localError, setLocalError] = useState('');
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [newName, setNewName] = useState(`${target.label}-crop`);

  const ext = extensionOf(target.key);
  const encoder = ENCODERS[ext];
  // A GIF or SVG cannot be re-encoded to the same format from a canvas, so an
  // in-place replace would silently change the key's extension. Block it.
  const canReplace = !!encoder;

  const takeBlob = async (): Promise<Blob | null> => {
    setLocalError('');
    if (!cropRef.current?.hasCrop()) {
      setLocalError('Drag a crop on the photo first — nothing has been cropped yet.');
      return null;
    }
    const enc = encoder ?? { mime: 'image/jpeg', quality: 0.92 };
    try {
      return await cropRef.current.getCroppedBlob(enc.mime, enc.quality);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not crop this image.');
      return null;
    }
  };

  const saveAsNew = async () => {
    const blob = await takeBlob();
    if (!blob) return;
    await onSaveAsNew(blob, newName.trim() || `${target.label}-crop`);
  };

  const replaceOriginal = async () => {
    const blob = await takeBlob();
    if (!blob) return;
    await onReplaceOriginal(blob, baseNameOf(target.key), ext);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Crop photo</h2>
            <p className="mt-1 text-sm text-white/60">
              <span className="font-semibold text-white/80">{target.label}</span>{' '}
              <span className="text-white/40">({target.key})</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <CropSurface
            ref={cropRef}
            src={target.url}
            alt={target.label}
            crossOrigin="anonymous"
            disabled={saving}
            maxHeightClass="max-h-[50vh]"
          />

          <label className="mt-4 block text-left">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
              Name for the new copy
            </span>
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              disabled={saving}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/30"
            />
          </label>

          {confirmingReplace && (
            <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-200">
                Replace the original in place?
              </p>
              <p className="mt-2 text-xs text-amber-100/80">
                This overwrites <span className="font-mono">{target.key}</span> itself. Everything
                pointing at that key changes — {referencingAlbums.length === 0
                  ? 'no album currently references it'
                  : `${referencingAlbums.length} album${
                      referencingAlbums.length === 1 ? '' : 's'
                    } reference it (${referencingAlbums.join(', ')})`}
                , plus any knowledge-graph node or share link using this URL. The original bytes are
                not recoverable from the app, and the CDN may keep serving the old image for a
                while.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmingReplace(false)}
                  disabled={saving}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={replaceOriginal}
                  disabled={saving}
                  className="rounded-full bg-rose-500/80 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
                >
                  {saving ? 'Replacing…' : 'Yes, overwrite it'}
                </button>
              </div>
            </div>
          )}

          {!canReplace && (
            <p className="mt-3 text-xs text-amber-300">
              This is a .{ext || 'unknown'} file. The browser cannot re-encode it to the same
              format, so replacing it in place would change its key. Save as a new photo instead.
            </p>
          )}
          {localError && <p className="mt-3 text-xs text-rose-300">{localError}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 p-6">
          <div className="text-xs">
            {status && <span className="text-emerald-300">{status}</span>}
            {error && <span className="text-rose-300">{error}</span>}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReplace(true)}
              disabled={saving || !canReplace || confirmingReplace}
              className="rounded-full border border-rose-400/40 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
            >
              Replace original
            </button>
            <button
              type="button"
              onClick={saveAsNew}
              disabled={saving}
              className="rounded-full bg-emerald-500/80 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {saving ? 'Saving…' : albumName ? `Save as new in ${albumName}` : 'Save as new photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
