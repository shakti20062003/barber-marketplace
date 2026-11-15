import { SetMetadata } from '@nestjs/common';

// Marks an endpoint as exempt from the global JwtAuthGuard (search, profiles,
// auth endpoints themselves). Everything else requires a valid JWT by default
// — safer than opting auth in per-route, since a forgotten guard silently
// exposes an endpoint.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
