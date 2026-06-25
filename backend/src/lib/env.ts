import 'dotenv/config';

// Centralized environment access. Values may be overridden at runtime by the
// Settings table (see settings.ts) for API keys.
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  apifyApiKey: process.env.APIFY_API_KEY ?? '',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  fromEmail: process.env.FROM_EMAIL ?? 'UpworkRadar <onboarding@resend.dev>',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
} as const;

export const isProduction = env.nodeEnv === 'production';
