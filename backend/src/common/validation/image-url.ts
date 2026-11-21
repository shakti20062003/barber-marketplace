import { z } from 'zod';

/**
 * An image reference: either a normal http(s) URL or an inline
 * `data:image/...;base64,` URL from an on-device upload. The frontend
 * downscales and JPEG-compresses before upload, so real uploads are
 * ~100-300 KB; the cap is a safety net. No object storage is configured
 * yet (Cloudinary env vars exist but are unused) — once it is, uploads
 * should go there and only the resulting URL should be stored.
 */
export const MAX_IMAGE_URL_LENGTH = 1_500_000;

export const imageUrlSchema = z
  .string()
  .max(MAX_IMAGE_URL_LENGTH, 'Image is too large — try a smaller photo')
  .refine(
    (v) => /^https?:\/\/\S+$/i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v),
    'Must be an image URL or an uploaded image',
  );
