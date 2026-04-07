# Thymeline

AI-powered weekly meal planning app built with Next.js, Better Auth, Drizzle ORM, and Postgres.

## Prerequisites

- Node 20+
- npm
- Docker (for local Postgres)
- Google OAuth credentials ([console.cloud.google.com](https://console.cloud.google.com))

## Local Development

### 1. Start Postgres

```bash
docker compose up -d
```

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

### 4. Install dependencies and push schema

```bash
npm install
npx drizzle-kit push
```

`drizzle-kit push` creates all tables in your Postgres database (app tables + Better Auth tables).

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google.

## Docker (full app)

```bash
cp .env.local.example .env
# Edit .env with your credentials
docker compose up --build
```

The app will be available at `http://localhost:3000`.

## Useful commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript check |
| `npm test` | Run tests (vitest) |
| `npx drizzle-kit push` | Push schema to database |
| `npx drizzle-kit studio` | Open Drizzle Studio (DB browser) |
| `npx drizzle-kit generate` | Generate migration files |

## Architecture

- **Auth:** Better Auth with Google OAuth. Server config in `lib/auth-server.ts`, client in `lib/auth-client.ts`. All API routes use `withAuth()` HOF from `lib/auth.ts`.
- **Database:** Postgres via Drizzle ORM. Schema in `lib/db/schema.ts`, client in `lib/db/index.ts`.
- **Access control:** Email whitelist via `ALLOWED_EMAILS` env var.
- **LLM:** Anthropic Claude via `lib/llm.ts`.
