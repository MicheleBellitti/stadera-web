# Stadera Web

Frontend for [Stadera](https://github.com/MicheleBellitti/Stadera): personal
weight tracking and nutrition coaching, integrated with Withings smart scales.

Built with Next.js 16 (App Router), React 19, Tailwind 4, TypeScript strict,
Biome, and pnpm. Auth, data shapes, and trends are owned by the
[stadera backend](https://github.com/MicheleBellitti/Stadera) (Rust + axum +
Postgres).

## Local development

### Prerequisites

- Node 20+ (we test on Node 22+)
- pnpm 10+
- The [stadera backend](https://github.com/MicheleBellitti/Stadera) running
  locally on port `8080` (set `PORT=8080` in its `.env`).

### Run

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000.

### Env vars

| Name | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend HTTP API base URL (no trailing slash) |

There is no `.env.example`: variables are listed here. Set them via your
shell, your dotenv tooling of choice, or pass them on the `pnpm` command line.

## Quality gates

```sh
pnpm check      # biome lint + format (auto-fix)
pnpm typecheck  # tsc --noEmit
pnpm build      # next build (production)
pnpm ci         # all of the above, no auto-fix — what CI runs
```

## Auth flow (high level)

1. Click **Sign in with Google** on the landing page.
2. Browser navigates to the backend's `/auth/google/start`.
3. Backend redirects to Google consent.
4. Google redirects back to the backend's `/auth/google/callback`.
5. Backend sets the `stadera_session` HttpOnly cookie and 302s back to this app.
6. The frontend reads `/me` from the backend (with `credentials: 'include'`)
   and renders the authenticated UI.

The frontend does **not** use Auth.js / NextAuth — the cookie set by the
backend is the only auth state.

## Project structure

```
src/
├── app/                  # App Router pages, layouts, route handlers
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Public landing
│   └── globals.css       # Tailwind base styles
└── lib/                  # (created in subsequent PRs) shared client code
    ├── api/              # openapi-typescript codegen output + fetch wrapper
    ├── auth/             # session helpers
    └── ...
public/                   # Static assets
```

## Roadmap

This repo follows the milestones laid out in
[stadera/.claude/docs/architecture.md](https://github.com/MicheleBellitti/Stadera/blob/main/.claude/docs/architecture.md).
The frontend is part of **M5**.

Initial scaffold ships in this PR; subsequent PRs add shadcn/ui, TanStack
Query, the OpenAPI codegen, and the dashboard / trend / history / profile
pages.
