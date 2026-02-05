import { useEffect, useMemo, useState } from 'react';
import { AuthBar, BrandLogo, EcosystemNav, LanguageSelector, authClient } from 'vegvisr-ui-kit';
import { LanguageContext } from './lib/LanguageContext';
import { getStoredLanguage, setStoredLanguage } from './lib/storage';
import { useTranslation } from './lib/useTranslation';

const AUTH_BASE = 'https://cookie.vegvisr.org';
const DASHBOARD_BASE = 'https://dashboard.vegvisr.org';
const PHOTOS_API_BASE = 'https://photos-api.vegvisr.org';
const DEFAULT_LIST_ENDPOINT = `${PHOTOS_API_BASE}/list-r2-images`;
const DEFAULT_UPLOAD_ENDPOINT = `${PHOTOS_API_BASE}/upload`;
const FAVICON_UPLOAD_ENDPOINT = `${PHOTOS_API_BASE}/upload-favicon`;
const FAVICON_LIST_ENDPOINT = `${PHOTOS_API_BASE}/favicons`;
const ALBUMS_ENDPOINT = 'https://albums.vegvisr.org/photo-albums';
const ALBUM_ENDPOINT = 'https://albums.vegvisr.org/photo-album';
const ALBUM_ADD_ENDPOINT = 'https://albums.vegvisr.org/photo-album/add';
const ALBUM_REMOVE_ENDPOINT = 'https://albums.vegvisr.org/photo-album/remove';
const DELETE_IMAGE_ENDPOINT = `${PHOTOS_API_BASE}/delete-r2-image`;
const TRASH_LIST_ENDPOINT = `${PHOTOS_API_BASE}/trash/list`;
const TRASH_RESTORE_ENDPOINT = `${PHOTOS_API_BASE}/trash/restore`;
const TRASH_DELETE_ENDPOINT = `${PHOTOS_API_BASE}/trash/delete`;

type PortfolioImage = {
  key: string;
  url: string;
};

type AuthUser = {
  email: string;
  userId: string;
  apiToken?: string | null;
  role?: string | null;
};

type AlbumMeta = {
  name: string;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type AlbumDetail = {
  name: string;
  images?: string[];
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageKey?: string | null;
};

const normalizeImages = (payload: any): PortfolioImage[] => {
  const images = payload?.images || payload?.data || payload?.items || [];
  if (!Array.isArray(images)) return [];
  return images.reduce<PortfolioImage[]>((acc, img) => {
    const key = img.key || img.r2Key || img.name || img.id || 'image';
    const url = img.url || img.r2Url || img.imageUrl || img.src || '';
    if (!url) return acc;
    acc.push({ key, url });
    return acc;
  }, []);
};

function App() {
  const [language, setLanguageState] = useState(getStoredLanguage());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authed' | 'anonymous'>('checking');
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [images, setImages] = useState<PortfolioImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [imageError, setImageError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [faviconLoadingKey, setFaviconLoadingKey] = useState('');
  const [faviconModalOpen, setFaviconModalOpen] = useState(false);
  const [faviconModalImage, setFaviconModalImage] = useState<PortfolioImage | null>(null);
  const [faviconModalUrls, setFaviconModalUrls] = useState<string[]>([]);
  const [faviconModalLoading, setFaviconModalLoading] = useState(false);
  const [faviconSets, setFaviconSets] = useState<Record<string, string[]>>({});
  const listEndpoint = DEFAULT_LIST_ENDPOINT;
  const uploadEndpoint = DEFAULT_UPLOAD_ENDPOINT;
  const [albums, setAlbums] = useState<AlbumMeta[]>([]);
  const [albumError, setAlbumError] = useState('');
  const [albumLoading, setAlbumLoading] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState('');
  const [albumNameInput, setAlbumNameInput] = useState('');
  const [albumRenameInput, setAlbumRenameInput] = useState('');
  const [showMyAlbums, setShowMyAlbums] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [albumPickerLoading, setAlbumPickerLoading] = useState(false);
  const [albumPickerError, setAlbumPickerError] = useState('');
  const [albumPickerImages, setAlbumPickerImages] = useState<PortfolioImage[]>([]);
  const [albumPickerSelection, setAlbumPickerSelection] = useState<string[]>([]);
  const [albumPickerSaving, setAlbumPickerSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [albumAssignedKeys, setAlbumAssignedKeys] = useState<string[]>([]);
  const [albumDetails, setAlbumDetails] = useState<Record<string, AlbumDetail>>({});
  const [seoTitleInput, setSeoTitleInput] = useState('');
  const [seoDescriptionInput, setSeoDescriptionInput] = useState('');
  const [seoImageKeyInput, setSeoImageKeyInput] = useState('');
  const [seoSaving, setSeoSaving] = useState(false);
  const [shareMode, setShareMode] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<
    { trashKey: string; originalKey?: string | null; deletedAt?: string | null; url: string }[]
  >([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState('');
  const [restoreAlbum, setRestoreAlbum] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const setLanguage = (value: typeof language) => {
    setLanguageState(value);
    setStoredLanguage(value);
  };

  const contextValue = useMemo(() => ({ language, setLanguage }), [language]);
  const t = useTranslation(language);
  const albumImageKeys = useMemo(() => new Set(images.map((image) => image.key)), [images]);
  const viewerItems = useMemo(() => {
    if (showTrash) {
      return trashItems.map((item) => ({
        url: item.url,
        label: item.originalKey || item.trashKey
      }));
    }
    return images.map((image) => ({ url: image.url, label: image.key }));
  }, [images, showTrash, trashItems]);
  const viewerItem = viewerItems[viewerIndex] || null;
  const assignedKeySet = useMemo(() => new Set(albumAssignedKeys), [albumAssignedKeys]);
  const selectedAlbumDetail = selectedAlbum ? albumDetails[selectedAlbum] : null;
  const selectedAlbumImages = Array.isArray(selectedAlbumDetail?.images)
    ? selectedAlbumDetail?.images
    : [];
  const seoCoverKey = seoImageKeyInput || selectedAlbumImages[0] || '';
  const seoCoverUrl = seoCoverKey ? `https://vegvisr.imgix.net/${seoCoverKey}` : '';
  const seoShareUrl = selectedAlbum
    ? `https://seo.vegvisr.org/album/${encodeURIComponent(selectedAlbum)}`
    : '';
  const publicShareUrl = selectedAlbum
    ? `https://photos.vegvisr.org/share/${encodeURIComponent(selectedAlbum)}`
    : '';

  useEffect(() => {
    if (!viewerOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewerOpen(false);
      } else if (event.key === 'ArrowRight') {
        setViewerIndex((prev) => (viewerItems.length ? (prev + 1) % viewerItems.length : prev));
      } else if (event.key === 'ArrowLeft') {
        setViewerIndex((prev) =>
          viewerItems.length ? (prev - 1 + viewerItems.length) % viewerItems.length : prev
        );
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [viewerItems.length, viewerOpen]);
  const isSuperadmin = authUser?.role === 'Superadmin';
  const isAdmin = authUser?.role === 'Admin';
  const shouldFilterToOwner = isAdmin || (isSuperadmin && showMyAlbums);
  const visibleAlbums = useMemo(() => {
    if (shouldFilterToOwner && (authUser?.email || authUser?.userId)) {
      return albums.filter((album) =>
        album.createdBy === authUser?.email || album.createdBy === authUser?.userId
      );
    }
    return albums;
  }, [albums, authUser?.email, authUser?.userId, shouldFilterToOwner]);
  const albumNames = useMemo(() => visibleAlbums.map((album) => album.name), [visibleAlbums]);

  const persistUser = (payload: any) => {
    const stored = authClient.persistUser(payload);
    if (!stored) return;
    setAuthUser({
      email: stored.email,
      userId: stored.user_id || stored.oauth_id || stored.email,
      apiToken: stored.emailVerificationToken || null,
      role: stored.role || null
    });
  };

  const fetchUserContext = async (targetEmail: string) => {
    const roleRes = await fetch(
      `${DASHBOARD_BASE}/get-role?email=${encodeURIComponent(targetEmail)}`
    );
    if (!roleRes.ok) {
      throw new Error(`User role unavailable (status: ${roleRes.status})`);
    }
    const roleData = await roleRes.json();
    if (!roleData?.role) {
      throw new Error('Unable to retrieve user role.');
    }

    const userDataRes = await fetch(
      `${DASHBOARD_BASE}/userdata?email=${encodeURIComponent(targetEmail)}`
    );
    if (!userDataRes.ok) {
      throw new Error(`Unable to fetch user data (status: ${userDataRes.status})`);
    }
    const userData = await userDataRes.json();
    return {
      email: targetEmail,
      role: roleData.role,
      user_id: userData.user_id,
      emailVerificationToken: userData.emailVerificationToken,
      oauth_id: userData.oauth_id,
      phone: userData.phone,
      phoneVerifiedAt: userData.phoneVerifiedAt,
      branding: userData.branding,
      profileimage: userData.profileimage
    };
  };

  const verifyMagicToken = async (token: string) => {
    const data = await authClient.verifyMagicLink({ token, baseUrl: AUTH_BASE });
    try {
      const userContext = await fetchUserContext(data.email);
      persistUser(userContext);
    } catch {
      persistUser({ email: data.email, role: 'user', user_id: data.email });
    }
  };

  const sendMagicLink = async () => {
    if (!loginEmail.trim()) return;
    setLoginError('');
    setLoginStatus('');
    setLoginLoading(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      await authClient.sendMagicLink({
        email: loginEmail.trim(),
        redirectUrl,
        baseUrl: AUTH_BASE
      });
      setLoginStatus('Magic link sent. Check your email.');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setLoginLoading(false);
    }
  };

  const clearAuth = () => {
    try {
      localStorage.removeItem('user');
      sessionStorage.removeItem('email_session_verified');
    } catch {
      // ignore storage errors
    }
    const base = 'vegvisr_token=; Path=/; Max-Age=0; SameSite=Lax; Secure';
    document.cookie = base;
    if (window.location.hostname.endsWith('vegvisr.org')) {
      document.cookie = `${base}; Domain=.vegvisr.org`;
    }
    setAuthUser(null);
    setAuthStatus('anonymous');
  };

  const buildListEndpoint = () => {
    try {
      const url = new URL(listEndpoint);
      if (selectedAlbum) {
        url.searchParams.set('album', selectedAlbum);
      } else {
        url.searchParams.delete('album');
      }
      return url.toString();
    } catch {
      return listEndpoint;
    }
  };

  const buildBaseListEndpoint = () => {
    try {
      const url = new URL(listEndpoint);
      url.searchParams.delete('album');
      return url.toString();
    } catch {
      return listEndpoint;
    }
  };

  const loadImages = async () => {
    if (showTrash) return;
    setLoadingImages(true);
    setImageError('');
    try {
      const headers = authUser?.apiToken ? { 'X-API-Token': authUser.apiToken } : undefined;
      const response = await fetch(buildListEndpoint(), { headers });
      if (!response.ok) {
        throw new Error(`Failed to load images (${response.status})`);
      }
      const data = await response.json();
      const normalized = normalizeImages(data);
      const visible = selectedAlbum
        ? normalized
        : normalized.filter((img) => !assignedKeySet.has(img.key));
      setImages(visible);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to load images.');
      setImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  const loadTrashItems = async () => {
    setTrashLoading(true);
    setTrashError('');
    try {
      const res = await fetch(TRASH_LIST_ENDPOINT);
      if (!res.ok) {
        throw new Error(`Failed to load trash (${res.status})`);
      }
      const data = await res.json();
      setTrashItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setTrashItems([]);
      setTrashError(err instanceof Error ? err.message : 'Failed to load trash.');
    } finally {
      setTrashLoading(false);
    }
  };

  const openTrashView = () => {
    setShowTrash(true);
    setSelectedAlbum('');
    setRestoreAlbum('');
    loadTrashItems();
  };

  const restoreTrashItem = async (item: { trashKey: string; originalKey?: string | null }) => {
    setTrashError('');
    setTrashLoading(true);
    try {
      const res = await fetch(TRASH_RESTORE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKey: item.trashKey, originalKey: item.originalKey || null })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Restore failed (${res.status})`);
      }
      const restored = await res.json();
      setTrashItems((prev) => prev.filter((entry) => entry.trashKey !== item.trashKey));
      if (restoreAlbum && restored?.restored) {
        await fetch(ALBUM_ADD_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(authUser?.apiToken ? { 'X-API-Token': authUser.apiToken } : {}) },
          body: JSON.stringify({ name: restoreAlbum, images: [restored.restored] })
        });
        setAlbumAssignedKeys((prev) => Array.from(new Set([...prev, restored.restored])));
      }
      await loadImages();
    } catch (err) {
      setTrashError(err instanceof Error ? err.message : 'Failed to restore image.');
    } finally {
      setTrashLoading(false);
    }
  };

  const deleteTrashItem = async (item: { trashKey: string }) => {
    setTrashError('');
    setTrashLoading(true);
    try {
      const res = await fetch(TRASH_DELETE_ENDPOINT, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKey: item.trashKey })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
      setTrashItems((prev) => prev.filter((entry) => entry.trashKey !== item.trashKey));
    } catch (err) {
      setTrashError(err instanceof Error ? err.message : 'Failed to delete trash item.');
    } finally {
      setTrashLoading(false);
    }
  };

  const uploadFiles = async (
    files: File[],
    options?: { includeAlbum?: boolean; statusLabel?: string }
  ) => {
    if (!uploadEndpoint) {
      setUploadError('Upload endpoint is not configured.');
      return;
    }
    const includeAlbum = options?.includeAlbum !== false;
    setUploadStatus(options?.statusLabel || 'Uploading...');
    setUploadError('');
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (includeAlbum && selectedAlbum) {
          formData.append('album', selectedAlbum);
        }
        if (authUser?.email) {
          formData.append('userEmail', authUser.email);
        }
        const res = await fetch(uploadEndpoint, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Upload failed (${res.status})`);
        }
      }
      setUploadStatus('Upload complete. Refreshing gallery...');
      await loadImages();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadStatus('');
    }
  };

  const uploadFileWithFilename = async (file: File, filename: string, endpoint?: string) => {
    const target = endpoint || uploadEndpoint;
    if (!target) {
      throw new Error('Upload endpoint is not configured.');
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', filename);
    if (authUser?.email) {
      formData.append('userEmail', authUser.email);
    }
    const res = await fetch(target, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Upload failed (${res.status})`);
    }
    return res.json();
  };

  const isImageUrl = (value: string) => {
    if (!value) return false;
    if (value.startsWith('data:image/')) return true;
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(value);
  };

  const fetchImageAsFile = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image (${response.status})`);
    }
    const blob = await response.blob();
    const nameFromUrl = url.split('/').pop() || 'image';
    const filename = nameFromUrl.split('?')[0] || 'image';
    return new File([blob], filename, { type: blob.type || 'image/jpeg' });
  };

  const uploadImageUrls = async (urls: string[]) => {
    const validUrls = urls.filter(isImageUrl);
    if (validUrls.length === 0) return;
    setUploadStatus('Uploading...');
    setUploadError('');
    try {
      const files: File[] = [];
      for (const url of validUrls) {
        files.push(await fetchImageAsFile(url));
      }
      await uploadFiles(files);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadStatus('');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const textData =
      event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
    if (textData) {
      const urls = textData
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      if (urls.length > 0) {
        uploadImageUrls(urls);
        return;
      }
    }
    const files = Array.from(event.dataTransfer.files || []).filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length === 0) return;
    uploadFiles(files);
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const goPrev = () => {
    setViewerIndex((prev) =>
      viewerItems.length ? (prev - 1 + viewerItems.length) % viewerItems.length : prev
    );
  };

  const goNext = () => {
    setViewerIndex((prev) => (viewerItems.length ? (prev + 1) % viewerItems.length : prev));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files: File[] = [];
    for (const item of Array.from(clipboard.items || [])) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      uploadFiles(files);
      return;
    }
    const text = clipboard.getData('text/plain');
    if (text && isImageUrl(text.trim())) {
      event.preventDefault();
      uploadImageUrls([text.trim()]);
    }
  };

  const downloadImage = async (image: PortfolioImage) => {
    try {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = image.key || 'image';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      setUploadError('Failed to download image.');
    }
  };

  const getBaseName = (image: PortfolioImage) => {
    const raw = image.key || image.url || 'image';
    const name = raw.split('/').pop() || raw;
    const withoutExt = name.replace(/\.[^/.]+$/, '');
    return withoutExt || 'image';
  };

  const parseFaviconSize = (value: string) => {
    const match = value.match(/-(\d+)x(\d+)\.png$/i) || value.match(/(\d+)x(\d+)/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { width, height };
  };

  const buildFaviconHtml = (urls: string[]) => {
    const bySize = new Map<number, string>();
    for (const url of urls) {
      const size = parseFaviconSize(url);
      if (size) {
        bySize.set(size.width, url);
      }
    }
    const icon32 = bySize.get(32);
    const icon180 = bySize.get(180);
    const icon512 = bySize.get(512);
    const lines: string[] = [];
    if (icon32) {
      lines.push(`<link rel="icon" type="image/png" sizes="32x32" href="${icon32}">`);
    }
    if (icon180) {
      lines.push(`<link rel="apple-touch-icon" sizes="180x180" href="${icon180}">`);
    }
    if (icon512) {
      lines.push(`<link rel="icon" type="image/png" sizes="512x512" href="${icon512}">`);
    }
    return lines.join('\n');
  };

  const fetchFaviconSet = async (image: PortfolioImage) => {
    const baseName = getBaseName(image);
    const prefix = `favicons/${baseName}-`;
    const url = new URL(FAVICON_LIST_ENDPOINT);
    url.searchParams.set('prefix', prefix);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to list favicons (${res.status})`);
    }
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const urls: string[] = [];
    for (const item of items as Array<{ url?: string; key?: string }>) {
      const value = item.url || item.key;
      if (value) urls.push(value);
    }
    return urls;
  };

  const createFaviconSet = async (image: PortfolioImage) => {
    if (!image.url) return;
    setUploadError('');
    setUploadStatus('Preparing favicon set...');
    setFaviconLoadingKey(image.key);
    try {
      const response = await fetch(image.url);
      if (!response.ok) {
        throw new Error(`Failed to load image (${response.status})`);
      }
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const baseName = getBaseName(image);
      const stamp = Date.now();
      const sizes = [32, 180, 512];
      const uploadedUrls: string[] = [];
      for (const size of sizes) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas not supported');
        }
        ctx.drawImage(bitmap, 0, 0, size, size);
        const outBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('Failed to create favicon'));
          }, 'image/png');
        });
        const filename = `favicons/${baseName}-${stamp}-${size}x${size}`;
        const file = new File([outBlob], `${filename}.png`, { type: 'image/png' });
        setUploadStatus(`Uploading ${size}x${size} favicon...`);
        const result = await uploadFileWithFilename(file, filename, FAVICON_UPLOAD_ENDPOINT);
        if (Array.isArray(result?.urls) && result.urls[0]) {
          uploadedUrls.push(result.urls[0]);
        } else if (Array.isArray(result?.keys) && result.keys[0]) {
          uploadedUrls.push(result.keys[0]);
        }
      }

      if (uploadedUrls.length > 0) {
        await navigator.clipboard.writeText(uploadedUrls.join('\n'));
        setUploadStatus('Favicon set uploaded. URLs copied to clipboard.');
      } else {
        throw new Error('No favicon URLs returned.');
      }
      return uploadedUrls;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to create favicon set.');
      return [];
    } finally {
      setFaviconLoadingKey('');
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  const openFaviconModal = async (image: PortfolioImage) => {
    setFaviconModalImage(image);
    setFaviconModalOpen(true);
    setUploadError('');

    const cached = faviconSets[image.key];
    if (cached && cached.length > 0) {
      setFaviconModalUrls(cached);
      return;
    }

    setFaviconModalUrls([]);
    setFaviconModalLoading(true);
    try {
      const existing = await fetchFaviconSet(image);
      if (existing.length > 0) {
        setFaviconSets((prev) => ({ ...prev, [image.key]: existing }));
        setFaviconModalUrls(existing);
        return;
      }
      const urls = (await createFaviconSet(image)) || [];
      if (urls.length > 0) {
        setFaviconSets((prev) => ({ ...prev, [image.key]: urls }));
        setFaviconModalUrls(urls);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to load favicons.');
    } finally {
      setFaviconModalLoading(false);
    }
  };

  const deleteImage = async (image: PortfolioImage) => {
    if (!image.key) return;
    const confirmed = window.confirm(`Delete "${image.key}" from storage?`);
    if (!confirmed) return;
    setImageError('');
    try {
      const url = `${DELETE_IMAGE_ENDPOINT}?key=${encodeURIComponent(image.key)}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
      if (selectedAlbum && authUser?.apiToken) {
        await fetch(ALBUM_REMOVE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authUser?.apiToken ? { 'X-API-Token': authUser.apiToken } : {})
          },
          body: JSON.stringify({ name: selectedAlbum, image: image.key })
        });
      }
      setAlbumAssignedKeys((prev) => prev.filter((item) => item !== image.key));
      await loadImages();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to delete image.');
    }
  };

  const copyImageUrl = async (image: PortfolioImage) => {
    if (!image.url) return;
    try {
      await navigator.clipboard.writeText(image.url);
      setCopiedKey(image.key);
      window.setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      setUploadError('Failed to copy image URL.');
    }
  };

  useEffect(() => {
    const token = authClient.parseMagicToken(window.location.href);
    if (!token) return;
    setAuthStatus('checking');
    verifyMagicToken(token)
      .then(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('magic');
        window.history.replaceState({}, '', url.toString());
        setAuthStatus('authed');
      })
      .catch(() => {
        setAuthStatus('anonymous');
      });
  }, []);

  useEffect(() => {
    const stored = readStoredUserSafe();
    if (stored) {
      setAuthUser(stored);
      setAuthStatus('authed');
      return;
    }
    setAuthStatus('anonymous');
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (!path.startsWith('/share/')) return;
    const albumName = decodeURIComponent(path.replace('/share/', '').trim());
    if (!albumName) return;
    setShareMode(true);
    setSelectedAlbum(albumName);
    setShowTrash(false);
  }, []);

  useEffect(() => {
    loadImages();
  }, [listEndpoint, selectedAlbum, albumAssignedKeys, showTrash]);

  useEffect(() => {
    const loadAlbums = async () => {
      setAlbumLoading(true);
      setAlbumError('');
      try {
        if (!authUser?.apiToken && !shareMode) {
          setAlbums([]);
          setAlbumDetails({});
          setAlbumAssignedKeys([]);
          setAlbumError('Sign in to view albums.');
          return;
        }
        if (shareMode) {
          return;
        }
        if (!authUser?.apiToken) {
          throw new Error('Missing API token.');
        }
        const res = await fetch(`${ALBUMS_ENDPOINT}?includeMeta=1`, {
          headers: { 'X-API-Token': authUser.apiToken }
        });
        if (!res.ok) {
          throw new Error(`Failed to load albums (${res.status})`);
        }
        const data = await res.json();
        const nextAlbums = Array.isArray(data?.albums)
          ? data.albums
            .map((album: any) =>
              typeof album === 'string'
                ? { name: album }
                : {
                  name: album?.name,
                  createdBy: album?.createdBy ?? null,
                  createdAt: album?.createdAt ?? null,
                  updatedAt: album?.updatedAt ?? null
                }
            )
            .filter((album: AlbumMeta) => album?.name)
          : [];
        setAlbums(nextAlbums);
        if (selectedAlbum && !nextAlbums.some((album: AlbumMeta) => album.name === selectedAlbum)) {
          setSelectedAlbum('');
        }

        const albumNames = nextAlbums.map((album: AlbumMeta) => album.name);
        const albumResponses = await Promise.all(
          albumNames.map(async (name: string) => {
            try {
              if (!authUser?.apiToken) {
                return { name, detail: null };
              }
              const detailRes = await fetch(`${ALBUM_ENDPOINT}?name=${encodeURIComponent(name)}`, {
                headers: { 'X-API-Token': authUser.apiToken }
              });
              if (!detailRes.ok) return { name, detail: null };
              const detail = await detailRes.json();
              return { name, detail };
            } catch {
              return { name, detail: null };
            }
          })
        );
        const detailsMap: Record<string, AlbumDetail> = {};
        const allKeys: string[] = [];
        albumResponses.forEach(({ name, detail }) => {
          if (!detail || typeof detail !== 'object') return;
          detailsMap[name] = { name, ...detail };
          const images = Array.isArray(detail?.images) ? detail.images : [];
          allKeys.push(...images);
        });
        setAlbumDetails(detailsMap);
        const mergedKeys = Array.from(new Set(allKeys.filter(Boolean)));
        setAlbumAssignedKeys(mergedKeys);
      } catch (err) {
        setAlbumError(err instanceof Error ? err.message : 'Failed to load albums.');
      } finally {
        setAlbumLoading(false);
      }
    };
    loadAlbums();
  }, [authUser?.apiToken]);

  useEffect(() => {
    if (!selectedAlbum) {
      setAlbumPickerOpen(false);
      setAlbumPickerSelection([]);
    }
  }, [selectedAlbum]);

  useEffect(() => {
    if (!selectedAlbum) {
      setSeoTitleInput('');
      setSeoDescriptionInput('');
      setSeoImageKeyInput('');
      return;
    }
    const detail = albumDetails[selectedAlbum];
    setSeoTitleInput(detail?.seoTitle ?? '');
    setSeoDescriptionInput(detail?.seoDescription ?? '');
    setSeoImageKeyInput(detail?.seoImageKey ?? '');
  }, [selectedAlbum, albumDetails]);

  useEffect(() => {
    if (shareMode || !shouldFilterToOwner || !selectedAlbum) return;
    if (!albumNames.includes(selectedAlbum)) {
      setSelectedAlbum('');
    }
  }, [shouldFilterToOwner, selectedAlbum, albumNames, shareMode]);

  const createAlbum = async () => {
    const name = albumNameInput.trim();
    if (!name) return;
    setAlbumError('');
    setAlbumLoading(true);
    try {
      const ownerId = authUser?.email || authUser?.userId;
      if (!authUser?.apiToken) {
        throw new Error('Please sign in to create an album.');
      }
      if (!ownerId) {
        throw new Error('Please sign in with a verified account to create an album.');
      }
      const res = await fetch(ALBUM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': authUser.apiToken },
        body: JSON.stringify({ name, images: [], createdBy: ownerId })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to create album (${res.status})`);
      }
      setAlbums((prev) => {
        const next = prev.filter((album) => album.name !== name);
        next.push({
          name,
          createdBy: ownerId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return next;
      });
      setAlbumDetails((prev) => ({
        ...prev,
        [name]: {
          name,
          images: [],
          createdBy: ownerId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }));
      setSelectedAlbum(name);
      setAlbumNameInput('');
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to create album.');
    } finally {
      setAlbumLoading(false);
    }
  };

  const renameAlbum = async () => {
    if (!selectedAlbum) return;
    const nextName = albumRenameInput.trim();
    if (!nextName) return;
    if (nextName === selectedAlbum) return;
    setAlbumError('');
    setAlbumLoading(true);
    try {
      if (!authUser?.apiToken) {
        throw new Error('Please sign in to rename albums.');
      }
      const albumImages = images.map((image) => image.key);
      const existingAlbum = albums.find((album) => album.name === selectedAlbum);
      const createRes = await fetch(ALBUM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': authUser.apiToken },
        body: JSON.stringify({
          name: nextName,
          images: albumImages,
          createdBy: existingAlbum?.createdBy || authUser?.email || authUser?.userId || null
        })
      });
      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(text || `Failed to create album (${createRes.status})`);
      }

      const deleteRes = await fetch(`${ALBUM_ENDPOINT}?name=${encodeURIComponent(selectedAlbum)}`, {
        method: 'DELETE',
        headers: { 'X-API-Token': authUser.apiToken }
      });
      if (!deleteRes.ok) {
        const text = await deleteRes.text();
        throw new Error(text || `Failed to delete album (${deleteRes.status})`);
      }

      setAlbums((prev) => {
        const nextAlbums = prev.filter((album) => album.name !== selectedAlbum);
        nextAlbums.push({
          name: nextName,
          createdBy: existingAlbum?.createdBy || authUser?.email || authUser?.userId || null,
          createdAt: existingAlbum?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return nextAlbums;
      });
      setAlbumDetails((prev) => {
        const next = { ...prev };
        const currentDetail = next[selectedAlbum];
        delete next[selectedAlbum];
        next[nextName] = {
          ...(currentDetail || {}),
          name: nextName,
          updatedAt: new Date().toISOString()
        };
        return next;
      });
      setSelectedAlbum(nextName);
      setAlbumRenameInput('');
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to rename album.');
    } finally {
      setAlbumLoading(false);
    }
  };

  const openAlbumPicker = async () => {
    setAlbumPickerOpen(true);
    setAlbumPickerError('');
    setAlbumPickerLoading(true);
    try {
      const res = await fetch(buildBaseListEndpoint());
      if (!res.ok) {
        throw new Error(`Failed to load images (${res.status})`);
      }
      const data = await res.json();
      setAlbumPickerImages(normalizeImages(data));
      setAlbumPickerSelection([]);
    } catch (err) {
      setAlbumPickerError(err instanceof Error ? err.message : 'Failed to load images.');
    } finally {
      setAlbumPickerLoading(false);
    }
  };

  const toggleAlbumPickerSelection = (key: string) => {
    setAlbumPickerSelection((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const saveAlbumPickerSelection = async () => {
    if (!selectedAlbum || albumPickerSelection.length === 0) return;
    setAlbumPickerSaving(true);
    setAlbumPickerError('');
    try {
      if (!authUser?.apiToken) {
        throw new Error('Please sign in to modify albums.');
      }
      const res = await fetch(ALBUM_ADD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': authUser.apiToken },
        body: JSON.stringify({ name: selectedAlbum, images: albumPickerSelection })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to add images (${res.status})`);
      }
      setAlbumAssignedKeys((prev) => Array.from(new Set([...prev, ...albumPickerSelection])));
      setAlbumDetails((prev) => {
        const current = prev[selectedAlbum];
        if (!current) return prev;
        const merged = Array.from(new Set([...(current.images || []), ...albumPickerSelection]));
        return {
          ...prev,
          [selectedAlbum]: { ...current, images: merged, updatedAt: new Date().toISOString() }
        };
      });
      await loadImages();
      setAlbumPickerOpen(false);
      setAlbumPickerSelection([]);
    } catch (err) {
      setAlbumPickerError(err instanceof Error ? err.message : 'Failed to add images.');
    } finally {
      setAlbumPickerSaving(false);
    }
  };

  const saveAlbumSeo = async () => {
    if (!selectedAlbum) return;
    setAlbumError('');
    setSeoSaving(true);
    try {
      if (!authUser?.apiToken) {
        throw new Error('Please sign in to update album share settings.');
      }
      const images = selectedAlbumImages;
      const res = await fetch(ALBUM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': authUser.apiToken },
        body: JSON.stringify({
          name: selectedAlbum,
          images,
          seoTitle: seoTitleInput.trim() || null,
          seoDescription: seoDescriptionInput.trim() || null,
          seoImageKey: seoImageKeyInput.trim() || null,
          isShared: true
        })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed to update album (${res.status})`);
      }
      const updated = await res.json();
      setAlbumDetails((prev) => ({
        ...prev,
        [selectedAlbum]: { name: selectedAlbum, ...updated }
      }));
    } catch (err) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to update share settings.');
    } finally {
      setSeoSaving(false);
    }
  };

  const copySeoShareUrl = async () => {
    if (!seoShareUrl) return;
    try {
      await navigator.clipboard.writeText(seoShareUrl);
      setCopiedKey('seo-share-link');
      window.setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      setAlbumError('Failed to copy share link.');
    }
  };

  const readStoredUserSafe = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.email) return null;
      return {
        email: parsed.email,
        userId: parsed.user_id || parsed.oauth_id || parsed.email,
        apiToken: parsed.emailVerificationToken || null,
        role: parsed.role || null
      } as AuthUser;
    } catch {
      return null;
    }
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(139,92,246,0.25),_transparent_55%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <BrandLogo label={t('app.title')} size={46} className="h-12 w-auto" />
            <div className="flex items-center gap-3">
              <LanguageSelector value={language} onChange={setLanguage} />
              <AuthBar
                userEmail={authStatus === 'authed' ? authUser?.email : undefined}
                badgeLabel={t('app.badge')}
                signInLabel="Sign in"
                logoutLabel="Log out"
                onSignIn={() => setLoginOpen((prev) => !prev)}
                onLogout={clearAuth}
              />
            </div>
          </header>

          <EcosystemNav className="mt-4" />

          {authStatus === 'anonymous' && loginOpen && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm text-white/80">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                Magic Link Sign In
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="you@email.com"
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={loginLoading}
                  className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30"
                >
                  {loginLoading ? 'Sending...' : 'Send link'}
                </button>
              </div>
              {loginStatus && <p className="mt-3 text-xs text-emerald-300">{loginStatus}</p>}
              {loginError && <p className="mt-3 text-xs text-rose-300">{loginError}</p>}
              <p className="mt-3 text-xs text-white/50">
                We will send a secure link that logs you into this app.
              </p>
            </div>
          )}

          <section className="mt-10 grid gap-8 lg:grid-cols-[0.45fr_0.55fr]">
            <div className={shareMode ? 'hidden' : 'space-y-6'}>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Albums</h2>
                    <p className="mt-2 text-sm text-white/60">
                      Organize photos into albums for quick sharing.
                    </p>
                  </div>
                  {isSuperadmin ? (
                    <button
                      type="button"
                      onClick={() => setShowMyAlbums((prev) => !prev)}
                      disabled={!authUser?.apiToken}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] ${
                        showMyAlbums
                          ? 'border-sky-400/70 bg-sky-500/20 text-white'
                          : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/20'
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Show only my albums
                    </button>
                  ) : isAdmin ? (
                    <span className="rounded-full border border-sky-400/50 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
                      My albums only
                    </span>
                  ) : null}
                </div>
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                      Create album
                    </label>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={albumNameInput}
                        onChange={(event) => setAlbumNameInput(event.target.value)}
                        placeholder="New album name"
                        className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                      />
                      <button
                        type="button"
                        onClick={createAlbum}
                        disabled={
                          albumLoading ||
                          !albumNameInput.trim() ||
                          !authUser?.apiToken ||
                          !(authUser?.email || authUser?.userId)
                        }
                        className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {albumLoading ? 'Saving...' : 'Create'}
                      </button>
                    </div>
                    {albumError && <p className="mt-3 text-xs text-rose-300">{albumError}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                      Rename album
                    </label>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={albumRenameInput}
                        onChange={(event) => setAlbumRenameInput(event.target.value)}
                        placeholder={selectedAlbum ? `Rename "${selectedAlbum}"` : 'Select an album first'}
                        disabled={!selectedAlbum}
                        className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={renameAlbum}
                        disabled={albumLoading || !selectedAlbum || !albumRenameInput.trim() || !authUser?.apiToken}
                        className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {albumLoading ? 'Renaming...' : 'Rename'}
                      </button>
                    </div>
                    {albumError && <p className="mt-3 text-xs text-rose-300">{albumError}</p>}
                  </div>
                  {selectedAlbum && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                        Share / SEO
                      </label>
                      <div className="mt-2 space-y-3">
                        <input
                          value={seoTitleInput}
                          onChange={(event) => setSeoTitleInput(event.target.value)}
                          placeholder={`Title (default: Album: ${selectedAlbum})`}
                          className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                        />
                        <textarea
                          value={seoDescriptionInput}
                          onChange={(event) => setSeoDescriptionInput(event.target.value)}
                          placeholder={`${selectedAlbumImages.length} photos`}
                          rows={3}
                          className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                        />
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <select
                            value={seoImageKeyInput}
                            onChange={(event) => setSeoImageKeyInput(event.target.value)}
                            className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                          >
                            <option value="">Cover image (default first photo)</option>
                            {selectedAlbumImages.map((key) => (
                              <option key={key} value={key}>
                                {key}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={saveAlbumSeo}
                            disabled={seoSaving}
                            className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {seoSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        {seoShareUrl && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                            Share link
                          </div>
                          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              readOnly
                              value={seoShareUrl}
                              className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-xs text-white/80"
                            />
                            <button
                              type="button"
                              onClick={copySeoShareUrl}
                              className="rounded-2xl bg-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                            >
                              {copiedKey === 'seo-share-link' ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          {publicShareUrl && (
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                              <input
                                readOnly
                                value={publicShareUrl}
                                className="flex-1 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-xs text-white/80"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(publicShareUrl);
                                    setCopiedKey('public-share-link');
                                    window.setTimeout(() => setCopiedKey(''), 1800);
                                  } catch {
                                    setAlbumError('Failed to copy public link.');
                                  }
                                }}
                                className="rounded-2xl bg-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                              >
                                {copiedKey === 'public-share-link' ? 'Copied' : 'Copy public'}
                              </button>
                            </div>
                          )}
                        </div>
                        )}
                        {seoCoverUrl && (
                          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                            <img
                              src={seoCoverUrl}
                              alt="Album cover"
                              className="h-32 w-full object-cover"
                            />
                          </div>
                        )}
                        {seoShareUrl && (
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                              Open Graph preview
                            </div>
                            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                              {seoCoverUrl && (
                                <img
                                  src={`${seoCoverUrl}?w=1200&h=630&fit=crop&auto=compress,format`}
                                  alt="Open Graph cover"
                                  className="h-40 w-full object-cover"
                                />
                              )}
                              <div className="space-y-1 px-4 py-3">
                                <div className="text-xs uppercase tracking-[0.25em] text-white/40">
                                  seo.vegvisr.org
                                </div>
                                <div className="text-sm font-semibold text-white">
                                  {seoTitleInput.trim() || `Album: ${selectedAlbum}`}
                                </div>
                                <div className="text-xs text-white/60">
                                  {seoDescriptionInput.trim() ||
                                    `${selectedAlbumImages.length} photo${
                                      selectedAlbumImages.length === 1 ? '' : 's'
                                    }`}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                      Select album
                    </label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {albumLoading && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/60">
                          Loading albums...
                        </div>
                      )}
                      {visibleAlbums.map((album) => (
                        <button
                          key={album.name}
                          type="button"
                          onClick={() => setSelectedAlbum(album.name)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            selectedAlbum === album.name
                              ? 'border-sky-400/60 bg-sky-500/10 text-white'
                              : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                          }`}
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                            Album
                          </div>
                          <div className="mt-1 truncate text-base font-semibold">{album.name}</div>
                        </button>
                      ))}
                      {!albumLoading && visibleAlbums.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/60">
                          No albums yet. Create one to start organizing.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`rounded-3xl border border-dashed border-white/20 bg-white/5 p-6 text-center shadow-2xl shadow-black/40 ${
                  dragActive ? 'ring-2 ring-sky-400/60' : ''
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onPaste={handlePaste}
                tabIndex={0}
              >
                <h3 className="text-lg font-semibold">Drag & drop uploads</h3>
                <p className="mt-2 text-sm text-white/60">
                  Drop images here or use the file picker.
                </p>
                {selectedAlbum && (
                  <p className="mt-2 text-xs text-white/50">
                    Uploading into <span className="font-semibold text-white/80">{selectedAlbum}</span>.
                  </p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-4 w-full text-sm text-white/70 file:mr-4 file:rounded-full file:border-0 file:bg-sky-500/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = '';
                    if (files.length) uploadFiles(files);
                  }}
                />
                {uploadStatus && <p className="mt-3 text-xs text-emerald-300">{uploadStatus}</p>}
                {uploadError && <p className="mt-3 text-xs text-rose-300">{uploadError}</p>}
              </div>
            </div>

            <div
              className={`rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 ${
                shareMode ? 'lg:col-span-2' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {showTrash
                      ? 'Trash'
                      : selectedAlbum
                        ? `${selectedAlbum} gallery`
                        : 'Portfolio gallery'}
                  </h2>
                  <p className="mt-2 text-sm text-white/60">
                    {showTrash
                      ? trashLoading
                        ? 'Loading trash...'
                        : `${trashItems.length} items in trash.`
                      : loadingImages
                        ? 'Loading images...'
                        : `${images.length} images loaded.`}
                  </p>
                </div>
                <div className={shareMode ? 'hidden' : 'flex items-center gap-2'}>
                  {showTrash && (
                    <select
                      value={restoreAlbum}
                      onChange={(event) => setRestoreAlbum(event.target.value)}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70"
                    >
                      <option value="">Restore to album...</option>
                      {albums.map((album) => (
                        <option key={album.name} value={album.name}>
                          {album.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowTrash(false);
                      setSelectedAlbum('');
                    }}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                  >
                    All photos
                  </button>
                  <button
                    type="button"
                    onClick={openTrashView}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                  >
                    Trash
                  </button>
                  {selectedAlbum && (
                    <button
                      type="button"
                      onClick={openAlbumPicker}
                      disabled={!authUser?.apiToken || showTrash}
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Add images
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={showTrash ? loadTrashItems : loadImages}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                  >
                    Reload
                  </button>
                </div>
              </div>
              {!showTrash && imageError && <p className="mt-4 text-xs text-rose-300">{imageError}</p>}
              {showTrash && trashError && <p className="mt-4 text-xs text-rose-300">{trashError}</p>}
              {albumPickerOpen && selectedAlbum && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">
                        Add photos to album
                      </h3>
                      <p className="mt-1 text-xs text-white/50">
                        Choose images to include in <span className="text-white/80">{selectedAlbum}</span>.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAlbumPickerOpen(false)}
                        className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={saveAlbumPickerSelection}
                        disabled={albumPickerSaving || albumPickerSelection.length === 0 || !authUser?.apiToken}
                        className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {albumPickerSaving ? 'Saving...' : 'Add selected'}
                      </button>
                    </div>
                  </div>
                  {albumPickerError && (
                    <p className="mt-3 text-xs text-rose-300">{albumPickerError}</p>
                  )}
                  {albumPickerLoading ? (
                    <p className="mt-4 text-sm text-white/60">Loading images...</p>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {albumPickerImages.map((image) => {
                        const isSelected = albumPickerSelection.includes(image.key);
                        const alreadyInAlbum = albumImageKeys.has(image.key);
                        return (
                          <button
                            type="button"
                            key={image.key}
                            onClick={() => {
                              if (!alreadyInAlbum) toggleAlbumPickerSelection(image.key);
                            }}
                            className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                              alreadyInAlbum
                                ? 'border-emerald-400/40 bg-emerald-500/10'
                                : isSelected
                                  ? 'border-sky-400/60 bg-sky-500/10'
                                  : 'border-white/10 bg-white/5 hover:border-white/30'
                            }`}
                          >
                            <div className="aspect-[4/3] overflow-hidden">
                              <img
                                src={image.url}
                                alt={image.key}
                                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-white/70">
                              <span className="truncate">{image.key}</span>
                              {alreadyInAlbum ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-200">
                                  In album
                                </span>
                              ) : (
                                <span
                                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] ${
                                    isSelected
                                      ? 'bg-sky-500/30 text-sky-100'
                                      : 'bg-white/10 text-white/60'
                                  }`}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {!albumPickerLoading && albumPickerImages.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/60">
                          No images found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(showTrash ? trashItems : images).map((item, index) => {
                  if (showTrash) {
                    const trashItem = item as {
                      trashKey: string;
                      originalKey?: string | null;
                      deletedAt?: string | null;
                      url: string;
                    };
                    return (
                      <div
                        key={trashItem.trashKey}
                        className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                      >
                        <button
                          type="button"
                          className="aspect-[4/3] w-full overflow-hidden text-left"
                          onClick={() => openViewer(index)}
                        >
                          <img
                            src={trashItem.url}
                            alt={trashItem.originalKey || trashItem.trashKey}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </button>
                        <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-white/70">
                          <span className="truncate">
                            {trashItem.originalKey || trashItem.trashKey}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => restoreTrashItem(trashItem)}
                              disabled={trashLoading}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              title="Restore"
                            >
                              <span className="material-symbols-rounded text-base">restore</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTrashItem(trashItem)}
                              disabled={trashLoading}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              title="Delete forever"
                            >
                              <span className="material-symbols-rounded text-base">delete_forever</span>
                            </button>
                          </div>
                        </div>
                        <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                          <span className="block truncate">
                            Deleted: {trashItem.deletedAt || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const image = item as PortfolioImage;
                  return (
                    <div
                      key={image.key}
                      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                    >
                      <button
                        type="button"
                        className="aspect-[4/3] w-full overflow-hidden text-left"
                        onClick={() => openViewer(index)}
                      >
                        <img
                          src={image.url}
                          alt={image.key}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      </button>
                      <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-white/70">
                        <span className="truncate">{image.key}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyImageUrl(image)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 hover:bg-white/20"
                            title="Copy URL"
                          >
                            <span className="material-symbols-rounded text-base">
                              {copiedKey === image.key ? 'check' : 'content_copy'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadImage(image)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 hover:bg-white/20"
                            title="Download"
                          >
                            <span className="material-symbols-rounded text-base">download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openFaviconModal(image)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Create favicon set"
                            disabled={faviconLoadingKey === image.key}
                          >
                            <span className="material-symbols-rounded text-base">
                              {faviconLoadingKey === image.key ? 'progress_activity' : 'branding_watermark'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteImage(image)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                            title="Delete"
                          >
                            <span className="material-symbols-rounded text-base">delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                        <span className="block truncate">{image.url}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!showTrash && !loadingImages && images.length === 0 && !imageError && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
                  No images found. Upload new images or check the list endpoint.
                </div>
              )}
              {showTrash && !trashLoading && trashItems.length === 0 && !trashError && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
                  Trash is empty.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      {viewerOpen && viewerItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="absolute inset-0" onClick={() => setViewerOpen(false)} />
          <div className="relative w-full max-w-5xl">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-white/70">{viewerItem.label}</div>
              <button
                type="button"
                onClick={() => setViewerOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 hover:bg-white/20"
                aria-label="Close"
              >
                <span className="material-symbols-rounded text-lg">close</span>
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4">
              <img
                src={viewerItem.url}
                alt={viewerItem.label}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrev}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 hover:bg-white/20"
              >
                <span className="material-symbols-rounded text-base">arrow_back</span>
                Prev
              </button>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 hover:bg-white/20"
              >
                Next
                <span className="material-symbols-rounded text-base">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {faviconModalOpen && faviconModalImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="absolute inset-0" onClick={() => setFaviconModalOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/50">Favicon Set</div>
                <div className="text-lg font-semibold">{faviconModalImage.key}</div>
              </div>
              <button
                type="button"
                onClick={() => setFaviconModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 hover:bg-white/20"
                aria-label="Close"
              >
                <span className="material-symbols-rounded text-lg">close</span>
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2">
                <img
                  src={faviconModalImage.url}
                  alt={faviconModalImage.key}
                  className="h-36 w-full object-cover"
                />
              </div>
              <div className="space-y-3 text-sm text-white/70">
                {faviconModalLoading && <div>Creating favicon set...</div>}
                {!faviconModalLoading && faviconModalUrls.length === 0 && (
                  <div>No favicon URLs yet.</div>
                )}
                {faviconModalUrls.length > 0 && (
                  <>
                    <div className="text-xs uppercase tracking-[0.3em] text-white/50">
                      URLs
                    </div>
                    <div className="space-y-2">
                      {faviconModalUrls.map((url) => (
                        <div
                          key={url}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                        >
                          <div className="truncate text-xs text-white/70">{url}</div>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(url);
                              setUploadStatus('Favicon URL copied.');
                              setTimeout(() => setUploadStatus(''), 1500);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 hover:bg-white/20"
                            title="Copy URL"
                          >
                            <span className="material-symbols-rounded text-sm">content_copy</span>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] text-white/70">
                      <div className="text-xs uppercase tracking-[0.3em] text-white/50">
                        HTML Snippet
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap">
                        {buildFaviconHtml(faviconModalUrls)}
                      </pre>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(faviconModalUrls.join('\\n'));
                        setUploadStatus('Favicon URLs copied to clipboard.');
                        setTimeout(() => setUploadStatus(''), 2000);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 hover:bg-white/20"
                    >
                      <span className="material-symbols-rounded text-base">content_copy</span>
                      Copy URLs
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const html = buildFaviconHtml(faviconModalUrls);
                        if (!html) return;
                        await navigator.clipboard.writeText(html);
                        setUploadStatus('Favicon HTML copied.');
                        setTimeout(() => setUploadStatus(''), 2000);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80 hover:bg-white/20"
                    >
                      <span className="material-symbols-rounded text-base">code</span>
                      Copy HTML
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export default App;
