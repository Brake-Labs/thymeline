# Thymeline

AI-powered weekly meal planning app built with Next.js, Better Auth, Drizzle ORM, and Postgres.

## Prerequisites

- Node 20+
- npm
- Docker (for local Postgres)
- Google OAuth credentials ([console.cloud.google.com](https://console.cloud.google.com))

## Local Development

### 1. Start the database

```bash
docker compose up -d
```

This starts a Postgres 16 container on port 5432 with a named volume for data persistence. The app itself runs via `npm run dev` (step 5).

### 2. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) > APIs & Services > Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy the Client ID and Client Secret

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
DATABASE_URL=postgresql://thymeline:thymeline@localhost:5432/thymeline
BETTER_AUTH_SECRET=<run: openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ALLOWED_EMAILS=you@gmail.com
LLM_API_KEY=<your Anthropic API key>
```

`ALLOWED_EMAILS` is a comma-separated whitelist. Leave empty for open access.

### 4. Install and run

```bash
npm install
npm run dev
```

Migrations run automatically on `npm run dev` (and `npm start`). Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

### Dev auth bypass (for testing without Google OAuth)

Set `DEV_BYPASS_AUTH=true` in `.env.local` to skip Google sign-in. All routes will use a dev user. Seed the dev user's database records first:

```bash
npx tsx scripts/seed-dev.ts
```

## Useful commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript check |
| `npm test` | Run tests (vitest) |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly (dev shortcut, skips migrations) |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |
| `docker compose up -d` | Start Postgres |
| `docker compose down` | Stop Postgres (data persists in volume) |
| `docker compose down -v` | Stop Postgres and delete data |

## Architecture

- **Auth:** Better Auth with Google OAuth. Server config in `lib/auth-server.ts`, client in `lib/auth-client.ts`. All API routes use `withAuth()` HOF from `lib/auth.ts`.
- **Database:** Postgres via Drizzle ORM. Schema in `lib/db/schema.ts`, client in `lib/db/index.ts`.
- **Access control:** Email whitelist via `ALLOWED_EMAILS` env var, enforced server-side in `withAuth()`.
- **LLM:** Anthropic Claude via `lib/llm.ts`.
