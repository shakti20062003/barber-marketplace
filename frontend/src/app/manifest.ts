import type { MetadataRoute } from 'next';

// Makes Trimly installable ("Add to Home Screen"). On iPhone, web push
// notifications only work for a site added to the Home Screen this way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trimly — Book barbers & salons',
    short_name: 'Trimly',
    description: 'Guaranteed slots at verified barbers, salons and beauty parlours near you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ea580c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
