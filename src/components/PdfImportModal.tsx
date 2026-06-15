export type PdfImportItem = {
  id: string;
  previewUrl: string;
  width: number;
  height: number;
  pageNumber: number;
  blob: Blob;
  /** Editable asset name (also used as displayName). */
  name: string;
  /** Editable comma-separated tags. */
  tags: string;
  /** Whether to include this image in the import. */
  selected: boolean;
  /** AI suggestion in flight for this item. */
  suggesting: boolean;
};

type PdfImportModalProps = {
  albumName: string;
  pdfName: string;
  items: PdfImportItem[];
  extracting: boolean;
  importing: boolean;
  importStatus: string;
  importError: string;
  onClose: () => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, patch: Partial<Pick<PdfImportItem, 'name' | 'tags'>>) => void;
  onSuggestOne: (id: string) => void;
  onSuggestAll: () => void;
  onImport: () => void;
};

export function PdfImportModal({
  albumName,
  pdfName,
  items,
  extracting,
  importing,
  importStatus,
  importError,
  onClose,
  onToggle,
  onEdit,
  onSuggestOne,
  onSuggestAll,
  onImport,
}: PdfImportModalProps) {
  const selectedCount = items.filter((item) => item.selected).length;
  const anySuggesting = items.some((item) => item.suggesting);
  const busy = extracting || importing || anySuggesting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Import images from PDF</h2>
            <p className="mt-1 text-sm text-white/60">
              {extracting
                ? `Extracting images from ${pdfName}…`
                : `${items.length} image${items.length === 1 ? '' : 's'} from ${pdfName}`}
              {albumName ? (
                <>
                  {' '}→ album <span className="font-semibold text-white/80">{albumName}</span>
                </>
              ) : (
                <span className="text-amber-300"> · no album selected (uploads to library)</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-3">
          <button
            type="button"
            onClick={onSuggestAll}
            disabled={busy || items.length === 0}
            className="rounded-full bg-sky-500/20 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500/30 disabled:opacity-40"
          >
            {anySuggesting ? 'Auto-labelling…' : 'Auto-label all (AI)'}
          </button>
          <span className="text-xs text-white/50">{selectedCount} selected for import</span>
        </div>

        <div className="grid gap-4 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {extracting && items.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-white/50">Reading PDF…</p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col gap-3 rounded-2xl border p-3 ${
                item.selected ? 'border-sky-400/40 bg-white/5' : 'border-white/10 bg-white/[0.02] opacity-60'
              }`}
            >
              <div className="relative">
                <img
                  src={item.previewUrl}
                  alt={item.name || `Page ${item.pageNumber}`}
                  className="aspect-video w-full rounded-xl object-cover"
                />
                <label className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => onToggle(item.id)}
                  />
                  include
                </label>
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white/70">
                  p{item.pageNumber} · {item.width}×{item.height}
                </span>
              </div>

              <input
                type="text"
                value={item.name}
                onChange={(event) => onEdit(item.id, { name: event.target.value })}
                placeholder="Asset name"
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <input
                type="text"
                value={item.tags}
                onChange={(event) => onEdit(item.id, { tags: event.target.value })}
                placeholder="tags, comma, separated"
                className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => onSuggestOne(item.id)}
                disabled={busy}
                className="self-start rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-40"
              >
                {item.suggesting ? 'Suggesting…' : 'Suggest name + tags'}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 p-6">
          <div className="text-xs">
            {importStatus && <span className="text-emerald-300">{importStatus}</span>}
            {importError && <span className="text-rose-300">{importError}</span>}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onImport}
              disabled={busy || selectedCount === 0}
              className="rounded-full bg-emerald-500/80 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {importing ? 'Importing…' : `Import ${selectedCount} to album`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
