import { useEffect, useMemo, useState } from 'react';
import { AuthBar, BrandLogo, EcosystemNav, LanguageSelector, authClient } from 'vegvisr-ui-kit';
import { LanguageContext } from './lib/LanguageContext';
import { getStoredLanguage, setStoredLanguage } from './lib/storage';
import { useTranslation } from './lib/useTranslation';

const AUTH_BASE = 'https://cookie.vegvisr.org';
const DASHBOARD_BASE = 'https://dashboard.vegvisr.org';
const DEFAULT_LIST_ENDPOINT = 'https://api.vegvisr.org/list-r2-images?size=small';
const DEFAULT_UPLOAD_ENDPOINT = 'https://api.vegvisr.org/upload-r2-image';

type PortfolioImage = {
  key: string;
  url: string;
};

type AuthUser = {
  email: string;
  userId: string;
  role?: string | null;
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
  const [listEndpoint, setListEndpoint] = useState(DEFAULT_LIST_ENDPOINT);
  const [uploadEndpoint, setUploadEndpoint] = useState(DEFAULT_UPLOAD_ENDPOINT);

  const setLanguage = (value: typeof language) => {
    setLanguageState(value);
    setStoredLanguage(value);
  };

  const contextValue = useMemo(() => ({ language, setLanguage }), [language]);
  const t = useTranslation(language);

  const persistUser = (payload: any) => {
    const stored = authClient.persistUser(payload);
    if (!stored) return;
    setAuthUser({
      email: stored.email,
      userId: stored.user_id || stored.oauth_id || stored.email,
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

  const loadImages = async () => {
    setLoadingImages(true);
    setImageError('');
    try {
      const response = await fetch(listEndpoint);
      if (!response.ok) {
        throw new Error(`Failed to load images (${response.status})`);
      }
      const data = await response.json();
      setImages(normalizeImages(data));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to load images.');
      setImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!uploadEndpoint) {
      setUploadError('Upload endpoint is not configured.');
      return;
    }
    setUploadStatus('Uploading...');
    setUploadError('');
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
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

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files || []).filter((file) =>
      file.type.startsWith('image/')
    );
    if (files.length === 0) return;
    uploadFiles(files);
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
    loadImages();
  }, [listEndpoint]);

  const readStoredUserSafe = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.email) return null;
      return {
        email: parsed.email,
        userId: parsed.user_id || parsed.oauth_id || parsed.email,
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
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40">
                <h2 className="text-xl font-semibold">Portfolio endpoints</h2>
                <p className="mt-2 text-sm text-white/60">
                  Configure the endpoints used to fetch and upload images from the Vegvisr portfolio.
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                      List endpoint
                    </label>
                    <input
                      value={listEndpoint}
                      onChange={(event) => setListEndpoint(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                      Upload endpoint
                    </label>
                    <input
                      value={uploadEndpoint}
                      onChange={(event) => setUploadEndpoint(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={loadImages}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                  >
                    Refresh gallery
                  </button>
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
              >
                <h3 className="text-lg font-semibold">Drag & drop uploads</h3>
                <p className="mt-2 text-sm text-white/60">
                  Drop images here or use the file picker.
                </p>
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

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Portfolio gallery</h2>
                  <p className="mt-2 text-sm text-white/60">
                    {loadingImages
                      ? 'Loading images...'
                      : `${images.length} images loaded.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadImages}
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                >
                  Reload
                </button>
              </div>
              {imageError && <p className="mt-4 text-xs text-rose-300">{imageError}</p>}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {images.map((image) => (
                  <div
                    key={image.key}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                  >
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={image.url}
                        alt={image.key}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-white/70">
                      <span className="truncate">{image.key}</span>
                      <button
                        type="button"
                        onClick={() => downloadImage(image)}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70 hover:bg-white/20"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!loadingImages && images.length === 0 && !imageError && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
                  No images found. Upload new images or check the list endpoint.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </LanguageContext.Provider>
  );
}

export default App;
