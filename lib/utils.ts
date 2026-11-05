import { Review, Spot } from '../types';

export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const formatDistance = (km: number) => km < 1 ? `${(km * 1000).toFixed(0)}m` : `${km.toFixed(1)}km`;

export const getAverageRating = (spot: Spot) => {
  if (!spot.reviews?.length) return 0;
  return spot.reviews.reduce((acc, r) => acc + r.rating, 0) / spot.reviews.length;
};

// Photos live in Firestore as data URLs. Anything else (remote URL,
// javascript:, tracking pixel) written by a third party is not rendered.
export const safeImageSrc = (src?: string | null) =>
  typeof src === 'string' && src.startsWith('data:image/') ? src : undefined;

export const randomId = (length = 12) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => (b % 36).toString(36)).join('');
};

// Text from Firestore can hold anything. Control characters become spaces, and a lone
// surrogate (half an emoji) is replaced, because encodeURIComponent throws on it.
export const encodeText = (s: string) => {
  const clean = s.replace(/[\u0000-\u001F\u007F]/g, ' ');
  try {
    return encodeURIComponent(clean);
  } catch {
    return encodeURIComponent(clean.replace(/[\uD800-\uDFFF]/g, String.fromCharCode(0xfffd)));
  }
};

export const reviewAvatar = (review: Review) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeText(review.userName)}`;

export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Unsupported image'));
  img.src = src;
});

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

// Downscale + re-encode as JPEG. Keeps Firestore documents well under the 1 MB limit
// and strips EXIF metadata (including GPS) from the uploaded photo.
export const compressImageFile = async (file: File, maxPx = 1200, quality = 0.75): Promise<string> => {
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
};

export const COVER_IMAGE = { maxPx: 1200, quality: 0.72 } as const;
export const REVIEW_IMAGE = { maxPx: 900, quality: 0.68 } as const;
