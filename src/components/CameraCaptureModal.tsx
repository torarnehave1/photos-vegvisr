import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraSuggestion = { name: string; tags: string };

type CameraCaptureModalProps = {
  /** Album the shot will be uploaded into. Empty string = general library. */
  albumName: string;
  /** Upload in flight (owned by the parent). */
  uploading: boolean;
  /** Parent-owned status/error text for the upload step. */
  uploadStatus: string;
  uploadError: string;
  onClose: () => void;
  /** Ask the backend for a name + tags for this shot. */
  onSuggest: (blob: Blob, name: string) => Promise<CameraSuggestion>;
  /** Upload the shot. Parent resolves on success, rejects/handles on failure. */
  onUpload: (blob: Blob, name: string, tags: string) => Promise<void>;
};

const facingLabel = (mode: 'user' | 'environment') =>
  mode === 'user' ? 'Front camera' : 'Back camera';

const cameraErrorMessage = (err: unknown) => {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied. Allow camera access for this site in your browser settings, then reopen this window.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      return 'The camera is already in use by another application.';
    default:
      return err instanceof Error ? err.message : 'Could not start the camera.';
  }
};

const defaultShotName = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `selfie-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export function CameraCaptureModal({
  albumName,
  uploading,
  uploadStatus,
  uploadError,
  onClose,
  onSuggest,
  onUpload,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimer = useRef<number | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [mirror, setMirror] = useState(true);
  const [useTimer, setUseTimer] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState('');
  const [multipleCameras, setMultipleCameras] = useState(false);

  const [shotBlob, setShotBlob] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState('');
  const [shotName, setShotName] = useState('');
  const [shotTags, setShotTags] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start (and restart on camera flip) the stream. Teardown on unmount stops the
  // tracks — otherwise the camera indicator stays lit after closing.
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setStarting(true);
      setCameraError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'This browser cannot open a camera here. getUserMedia requires a secure origin (https:// or localhost).'
        );
        setStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) {
          setMultipleCameras(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch (err) {
        if (!cancelled) setCameraError(cameraErrorMessage(err));
      } finally {
        if (!cancelled) setStarting(false);
      }
    };
    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facingMode, stopStream]);

  useEffect(
    () => () => {
      if (countdownTimer.current) window.clearInterval(countdownTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!shotUrl) return;
    return () => URL.revokeObjectURL(shotUrl);
  }, [shotUrl]);

  const grabFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCameraError('The camera preview is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('Could not read a frame from the camera.');
      return;
    }
    // Bake the mirror into the file so the saved photo matches the preview.
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Could not encode the captured frame.');
          return;
        }
        setShotBlob(blob);
        setShotUrl(URL.createObjectURL(blob));
        setShotName(defaultShotName());
        setShotTags('');
        setSuggestError('');
      },
      'image/jpeg',
      0.92
    );
  }, [mirror]);

  const capture = () => {
    if (countdown > 0) return;
    if (!useTimer) {
      grabFrame();
      return;
    }
    setCountdown(3);
    countdownTimer.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimer.current) window.clearInterval(countdownTimer.current);
          countdownTimer.current = null;
          grabFrame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const retake = () => {
    setShotBlob(null);
    setShotUrl('');
    setShotName('');
    setShotTags('');
    setSuggestError('');
  };

  const suggest = async () => {
    if (!shotBlob) return;
    setSuggesting(true);
    setSuggestError('');
    try {
      const suggestion = await onSuggest(shotBlob, shotName);
      if (suggestion.name) setShotName(suggestion.name);
      if (suggestion.tags) setShotTags(suggestion.tags);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Suggestion failed.');
    } finally {
      setSuggesting(false);
    }
  };

  const addToAlbum = async () => {
    if (!shotBlob) return;
    await onUpload(shotBlob, shotName.trim() || defaultShotName(), shotTags);
  };

  const busy = uploading || suggesting || countdown > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {shotBlob ? 'Review your photo' : 'Take a photo'}
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {albumName ? (
                <>
                  Uploads into album{' '}
                  <span className="font-semibold text-white/80">{albumName}</span>
                </>
              ) : (
                <span className="text-amber-300">No album selected — uploads to the library</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
            {/* The <video> stays mounted while reviewing so the stream survives a retake. */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`aspect-video w-full object-cover ${shotBlob ? 'hidden' : ''}`}
              style={mirror ? { transform: 'scaleX(-1)' } : undefined}
            />
            {shotBlob && (
              <img src={shotUrl} alt="Captured photo" className="aspect-video w-full object-cover" />
            )}
            {!shotBlob && starting && !cameraError && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                Starting camera…
              </p>
            )}
            {!shotBlob && countdown > 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white drop-shadow-lg">
                {countdown}
              </span>
            )}
          </div>

          {cameraError && <p className="mt-3 text-sm text-rose-300">{cameraError}</p>}

          {!shotBlob ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={capture}
                disabled={starting || !!cameraError || countdown > 0}
                className="rounded-full bg-sky-500/80 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {countdown > 0 ? `Capturing in ${countdown}…` : 'Capture'}
              </button>
              {multipleCameras && (
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
                  }
                  disabled={starting || countdown > 0}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  Switch to {facingLabel(facingMode === 'user' ? 'environment' : 'user')}
                </button>
              )}
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={mirror}
                  onChange={(event) => setMirror(event.target.checked)}
                />
                Mirror
              </label>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={useTimer}
                  onChange={(event) => setUseTimer(event.target.checked)}
                />
                3s timer
              </label>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <label className="block text-left">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                  Asset name
                </span>
                <input
                  type="text"
                  value={shotName}
                  onChange={(event) => setShotName(event.target.value)}
                  placeholder="Asset name"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/30"
                />
              </label>
              <label className="block text-left">
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                  Tags
                </span>
                <input
                  type="text"
                  value={shotTags}
                  onChange={(event) => setShotTags(event.target.value)}
                  placeholder="tags, comma, separated"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/30"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={retake}
                  disabled={busy}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={suggest}
                  disabled={busy}
                  className="rounded-full bg-sky-500/20 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500/30 disabled:opacity-40"
                >
                  {suggesting ? 'Suggesting…' : 'Suggest name + tags (AI)'}
                </button>
              </div>
              {suggestError && <p className="text-xs text-rose-300">{suggestError}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 p-6">
          <div className="text-xs">
            {uploadStatus && <span className="text-emerald-300">{uploadStatus}</span>}
            {uploadError && <span className="text-rose-300">{uploadError}</span>}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addToAlbum}
              disabled={!shotBlob || busy}
              className="rounded-full bg-emerald-500/80 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : albumName ? `Add to ${albumName}` : 'Add to library'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
