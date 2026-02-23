import { ConvexHttpClient } from 'convex/browser';

// Re-export Convex API so all files can use `import { api } from '@/lib/convex'`
// instead of fragile relative paths to `../../convex/_generated/api`
export { api } from '../../convex/_generated/api';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
}

const globalForConvex = globalThis as unknown as {
  convexClient: ConvexHttpClient | undefined;
};

export const convexClient =
  globalForConvex.convexClient ?? new ConvexHttpClient(convexUrl);

if (process.env.NODE_ENV !== 'production') {
  globalForConvex.convexClient = convexClient;
}

export default convexClient;
