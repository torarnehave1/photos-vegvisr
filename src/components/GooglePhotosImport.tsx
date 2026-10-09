import { useEffect, useRef, useState } from 'react';
import { MAX_VIDEO_BYTES } from '../lib/media';

/**
 * Import from Google Photos into the selected album.
 *
 * Reuses the existing Google sign-in on auth.vegvisr.org (the same one www.vegvisr.org uses):
 *   /picker/auth            Google consent, token stored server-side under the user's email
 *   /picker/get-credentials hands the short-lived access token to its owner
 *   /picker/proxy-image     fetches the media bytes (Google's media hosts send no CORS headers)
 * The choosing itself happens in Google's own picker window — the Picker API gives an app
 * access only to the items the user picks there, never to the library.
 */

const AUTH_WORKER_BASE = 'https://auth.vegvisr.org';
const PICKER_API_BASE = 'https://photospicker.googleapis.com/v1';
const POPUP_NAME = 'vegvisr-google-photos';
const AUTH_CHANNEL = 'vegvisr-picker-auth';
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_PICK_TIMEOUT_MS = 15 * 60 * 1000;
// Google's size parameters top out here; used when a HEIC original is converted to JPEG.
const MAX_GOOGLE_DIMENSION = 16383;

type Phase = 'idle' | 'connecting' | 'opening' | 'choosing' | 'downloading' | 'uploading' | 'done';

type PickedMediaItem = {
  id: string;
  type?: string;
  mediaFile?: {
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
};

type PickerSession = {
  id: string;
  pickerUri?: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
};

type AuthMessage = { type?: string; success?: boolean; email?: string; error?: string };

type Props = {
  userEmail: string;
  apiToken: string;
  albumName: string;
  /** Uploads the files into the album. Resolves true when every file was stored. */
  onImport: (files: File[]) => Promise<boolean>;
  onClose: () => void;
};

class CancelledError extends Error {}
class GoogleAuthExpiredError extends Error {}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Picker API durations arrive as protobuf strings, e.g. "5s" or "1800.5s". */
const parseDurationMs = (value: string | undefined, fallback: number) => {
  const seconds = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback;
};

const replaceExtension = (filename: string, extension: string) =>
  `${filename.replace(/\.[^./\\]+$/, '')}.${extension}`;

export function GooglePhotosImport({ userEmail, apiToken, albumName, onImport, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [pickerUri, setPickerUri] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  const cancelledRef = useRef(false);
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      try {
        channelRef.current?.postMessage({ type: 'picker-close' });
        popupRef.current?.close();
      } catch {
        // Best effort, see closePopup.
      }
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = (message: Record<string, unknown>) => {
    try {
      channelRef.current?.postMessage(message);
    } catch {
      // The channel is a convenience for the popup; the flow does not depend on it.
    }
  };

  /** Best effort: the handle is dead once Google's pages have cut the opener link. */
  const closePopup = () => {
    broadcast({ type: 'picker-close' });
    try {
      popupRef.current?.close();
    } catch {
      // Nothing to do — the return page shows its own "you can close this window".
    }
    popupRef.current = null;
  };

  const assertActive = () => {
    if (cancelledRef.current) throw new CancelledError('Cancelled');
  };

  const authHeaders = { 'Content-Type': 'application/json', 'X-API-Token': apiToken };

  /** The stored Google access token, or null when the user has to sign in (again). */
  const fetchAccessToken = async (): Promise<string | null> => {
    const res = await fetch(`${AUTH_WORKER_BASE}/picker/get-credentials`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ user_email: userEmail })
    });
    if (res.status === 404 || res.status === 410) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Could not read Google credentials (${res.status}).`);
    }
    // A stored record without a token is the same as no record: sign in.
    return (data?.access_token as string | undefined) || null;
  };

  /**
   * Sends the popup through Google sign-in and resolves with the new access token.
   * The return page reports over the BroadcastChannel; polling get-credentials is the
   * backstop for when that page never loads (it also catches a sign-in that finished late).
   */
  const signIn = async (popup: Window): Promise<string> => {
    setPhase('connecting');
    const returnUrl = `${window.location.origin}/picker-return.html`;

    let reported: AuthMessage | null = null;
    channelRef.current?.close();
    try {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event: MessageEvent<AuthMessage>) => {
        if (event.data?.type === 'picker-auth') reported = event.data;
      };
      channelRef.current = channel;
    } catch {
      channelRef.current = null;
    }

    popup.location.href = `${AUTH_WORKER_BASE}/picker/auth?return_url=${encodeURIComponent(returnUrl)}`;

    const deadline = Date.now() + AUTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(2500);
      assertActive();
      const message = reported as AuthMessage | null;
      if (message) {
        if (!message.success) {
          throw new Error(`Google sign-in failed: ${message.error || 'no result returned'}`);
        }
        // Credentials are stored under the Google email and handed out only to the Vegvisr
        // account with that same email, so a different Google account can never be read back.
        if (message.email && message.email.toLowerCase() !== userEmail.toLowerCase()) {
          const text = `You signed in to Google as ${message.email}, but your Vegvisr account is ${userEmail}. Sign in with the Google account that matches.`;
          broadcast({ type: 'picker-close', message: text, error: true });
          throw new Error(text);
        }
      }
      const token = await fetchAccessToken();
      if (token) return token;
      if (message) {
        throw new Error('Google sign-in completed, but no credentials were stored. Try again.');
      }
    }
    throw new Error('Google sign-in timed out. Try again.');
  };

  const createSession = async (accessToken: string): Promise<PickerSession> => {
    const res = await fetch(`${PICKER_API_BASE}/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (res.status === 401) throw new GoogleAuthExpiredError('Google session expired.');
    if (!res.ok) throw new Error(`Google Photos refused to open a picker session (${res.status}).`);
    const session = (await res.json()) as PickerSession;
    if (!session.id || !session.pickerUri) throw new Error('Google Photos returned no picker link.');
    return session;
  };

  const waitForSelection = async (accessToken: string, session: PickerSession) => {
    const interval = Math.max(parseDurationMs(session.pollingConfig?.pollInterval, 3000), 2000);
    const deadline = Date.now() + parseDurationMs(session.pollingConfig?.timeoutIn, DEFAULT_PICK_TIMEOUT_MS);
    while (Date.now() < deadline) {
      await sleep(interval);
      assertActive();
      const res = await fetch(`${PICKER_API_BASE}/sessions/${session.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error(`Could not check the Google Photos picker (${res.status}).`);
      const current = (await res.json()) as PickerSession;
      if (current.mediaItemsSet) return;
    }
    throw new Error('No selection was made in Google Photos before the picker timed out.');
  };

  const listPickedItems = async (accessToken: string, sessionId: string) => {
    const items: PickedMediaItem[] = [];
    let pageToken = '';
    do {
      const url = new URL(`${PICKER_API_BASE}/mediaItems`);
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`Could not read the selected items (${res.status}).`);
      const data = (await res.json()) as { mediaItems?: PickedMediaItem[]; nextPageToken?: string };
      items.push(...(data.mediaItems || []));
      pageToken = data.nextPageToken || '';
      assertActive();
    } while (pageToken);
    return items;
  };

  /** Downloads one picked item at original quality and wraps it as an uploadable File. */
  const downloadItem = async (item: PickedMediaItem, index: number): Promise<File> => {
    const media = item.mediaFile;
    if (!media?.baseUrl) throw new Error('no download link');
    const mimeType = media.mimeType || '';
    const isVideo = item.type === 'VIDEO' || mimeType.startsWith('video/');
    const isHeic = /image\/hei[cf]/i.test(mimeType);
    let filename = media.filename || `google-photos-${Date.now()}-${index + 1}`;

    let suffix = '=d';
    if (isVideo) {
      // =dv is Google's transcoded MP4, whatever container the original was in.
      suffix = '=dv';
      filename = replaceExtension(filename, 'mp4');
    } else if (isHeic) {
      // Browsers cannot display HEIC. A sized request makes Google serve a JPEG instead.
      const width = Math.min(media.mediaFileMetadata?.width || MAX_GOOGLE_DIMENSION, MAX_GOOGLE_DIMENSION);
      const height = Math.min(media.mediaFileMetadata?.height || MAX_GOOGLE_DIMENSION, MAX_GOOGLE_DIMENSION);
      suffix = `=w${width}-h${height}`;
      filename = replaceExtension(filename, 'jpg');
    }

    const res = await fetch(`${AUTH_WORKER_BASE}/picker/proxy-image`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ baseUrl: `${media.baseUrl}${suffix}`, user_email: userEmail })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || `download failed (${res.status})`);
    }
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('empty file');
    if (isVideo && blob.size > MAX_VIDEO_BYTES) {
      throw new Error(
        `${Math.round(blob.size / 1024 / 1024)} MB, videos can be at most ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB`
      );
    }
    const type = isVideo ? 'video/mp4' : isHeic ? 'image/jpeg' : blob.type || mimeType || 'image/jpeg';
    return new File([blob], filename, { type });
  };

  const start = async () => {
    // Opened synchronously inside the click, before any await — otherwise the browser's
    // popup blocker stops it. Every later step only navigates this same window.
    const popup = window.open('', POPUP_NAME, 'width=1000,height=760');
    if (!popup) {
      setError('The browser blocked the Google window. Allow pop-ups for this site and try again.');
      return;
    }
    popupRef.current = popup;
    setError('');
    setSkipped([]);
    setPickerUri('');
    setImportedCount(0);
    setProgress({ done: 0, total: 0 });
    setPhase('opening');

    let sessionId = '';
    let accessToken = '';
    try {
      let signedInNow = false;
      let token = await fetchAccessToken();
      assertActive();
      if (!token) {
        token = await signIn(popup);
        signedInNow = true;
      }

      let session: PickerSession;
      try {
        session = await createSession(token);
      } catch (err) {
        // A stored token Google no longer accepts: sign in once more, then retry.
        if (!(err instanceof GoogleAuthExpiredError) || signedInNow) throw err;
        // Drop the dead token first, or the sign-in wait would read it straight back.
        await fetch(`${AUTH_WORKER_BASE}/picker/delete-credentials`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ user_email: userEmail })
        });
        token = await signIn(popup);
        session = await createSession(token);
      }
      assertActive();
      accessToken = token;
      sessionId = session.id;

      // /autoclose makes Google close its window once the user presses Done.
      const uri = `${session.pickerUri}/autoclose`;
      setPickerUri(uri);
      setPhase('choosing');
      // Two routes to the same navigation: directly, while this page still holds the
      // window; and via the return page, which listens for it when Google's sign-in pages
      // have cut that link. The panel also shows the link for the case where neither lands.
      try {
        if (!popup.closed) popup.location.href = uri;
      } catch {
        // Fall through to the broadcast and the manual link.
      }
      broadcast({ type: 'picker-navigate', url: uri });

      await waitForSelection(accessToken, session);
      const items = await listPickedItems(accessToken, sessionId);
      if (items.length === 0) throw new Error('Nothing was selected in Google Photos.');

      setPhase('downloading');
      setProgress({ done: 0, total: items.length });
      const files: File[] = [];
      const failed: string[] = [];
      for (const [index, item] of items.entries()) {
        assertActive();
        try {
          files.push(await downloadItem(item, index));
        } catch (err) {
          const label = item.mediaFile?.filename || `item ${index + 1}`;
          failed.push(`${label}: ${err instanceof Error ? err.message : 'download failed'}`);
        }
        setProgress({ done: index + 1, total: items.length });
      }
      setSkipped(failed);
      if (files.length === 0) throw new Error('None of the selected items could be downloaded.');

      assertActive();
      setPhase('uploading');
      const stored = await onImport(files);
      if (!stored) throw new Error('The upload to Vegvisr Photos failed. See the message in the upload panel.');
      setImportedCount(files.length);
      setPhase('done');
    } catch (err) {
      closePopup();
      if (err instanceof CancelledError) return;
      setError(err instanceof Error ? err.message : 'Google Photos import failed.');
      setPhase('idle');
    } finally {
      // Sessions are single-use. Google asks for them to be deleted once the bytes are fetched.
      if (sessionId && accessToken) {
        fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        }).catch(() => undefined);
      }
      channelRef.current?.close();
      channelRef.current = null;
    }
  };

  const busy = phase !== 'idle' && phase !== 'done';

  const statusText: Record<Phase, string> = {
    idle: '',
    connecting: 'Sign in to Google in the window that opened.',
    opening: 'Opening Google Photos...',
    choosing: 'Choose your photos in the Google Photos window, then press Done there.',
    downloading: `Fetching from Google Photos... ${progress.done} / ${progress.total}`,
    uploading: `Uploading into ${albumName}...`,
    done: `Added ${importedCount} ${importedCount === 1 ? 'item' : 'items'} to ${albumName}.`
  };

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
            Add from Google Photos
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Pick photos or videos in Google Photos to copy into{' '}
            <span className="text-white/80">{albumName}</span>. Google account: {userEmail}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
          >
            {busy ? 'Cancel' : 'Close'}
          </button>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === 'done' ? 'Choose more' : 'Choose in Google Photos'}
          </button>
        </div>
      </div>
      {statusText[phase] && <p className="mt-3 text-xs text-white/70">{statusText[phase]}</p>}
      {phase === 'choosing' && pickerUri && (
        <p className="mt-2 text-xs text-white/50">
          Window did not open?{' '}
          <a href={pickerUri} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline">
            Open the Google Photos picker
          </a>
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {skipped.length > 0 && (
        <div className="mt-3 text-xs text-amber-200">
          <p>Skipped {skipped.length}:</p>
          <ul className="mt-1 list-disc pl-5">
            {skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
