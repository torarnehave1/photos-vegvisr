const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|mov)$/i;

/** File-picker filter: everything the gallery can show. */
export const MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov';

/**
 * /upload reads the whole request body inside the worker, and Cloudflare caps a request body at
 * 100 MB on this zone's plan. Refusing here gives a readable message instead of a failed request.
 */
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

/** A gallery item is a video when its key (or URL path) carries a video extension. */
export const isVideoKey = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return VIDEO_EXTENSIONS.test(value.split(/[?#]/)[0]);
};

export const isVideoFile = (file: File): boolean =>
  file.type.startsWith('video/') || isVideoKey(file.name);

export const isMediaFile = (file: File): boolean =>
  file.type.startsWith('image/') || isVideoFile(file);
