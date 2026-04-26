@AGENTS.md

# stadera-web

Frontend for Stadera (https://github.com/MicheleBellitti/Stadera). The
backend (Rust + axum) lives in the sibling `stadera` repo.

## Working agreement

This frontend is **fully Claude-implemented**. The backend is mentor-implemented
by Michele; Claude reviews. Here the relationship is inverted: Claude writes
directly, Michele reviews and validates architectural choices.

For non-trivial architectural decisions (state management library, auth
flow shape, deploy target, design system) Claude consults Michele before
implementing. For routine implementation Claude proceeds.

Respond in Italian when addressed in Italian, English otherwise.

## Stack

- **Next.js 16** App Router, React 19, RSC by default.
- **TypeScript** strict.
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives, copy-pasted into repo).
- **TanStack Query v5** for client-side data fetching/caching.
- **openapi-typescript** + **openapi-fetch** to codegen TS types from the
  backend's `/api-docs/openapi.json` and produce a typed fetch wrapper.
- **react-hook-form** + **zod** for forms and runtime validation.
- **Recharts** for the weight trend chart.
- **Biome** for linting + formatting (single tool, replaces ESLint+Prettier).
- **pnpm** package manager.

shadcn/ui, TanStack Query, openapi codegen, react-hook-form, and Recharts
are added incrementally in subsequent PRs — not in the initial scaffold.

## Auth

Cookie-based server-side sessions, **set by the backend**. Frontend does
NOT use Auth.js / NextAuth — it just consumes the `stadera_session` cookie.

Flow:
- Login: `<a href="${API}/auth/google/start">` triggers a full-page nav to
  the backend's OAuth endpoint.
- Backend redirects to Google consent, then back to `/auth/google/callback`,
  sets the cookie, and 302s the browser to `FRONTEND_ORIGIN` (this app).
- All API calls use `credentials: 'include'` so the cookie is sent.

In dev:
- Backend on `PORT=8080`, frontend on `3000`.
- Cookie has no `Domain` attribute → host-only on `localhost`, shared between
  ports because cookies don't include port in their host check.
- Backend CORS allows `http://localhost:3000` with `credentials: true`.

## Conventions

- **Trunk-based**: `main` always deployable, short-lived feature branches.
- **Branch naming**: `<type>/<short-desc>` (e.g. `feat/dashboard`, `fix/auth-redirect`).
- **Conventional Commits** enforced. Squash merge: 1 PR = 1 commit on `main`.
- **CI gate**: `pnpm verify` (`biome check` + codegen-up-to-date check +
  `tsc --noEmit` + `next build`) must pass. Script is not named `ci`
  because pnpm 10 reserves that name.
- **No `.env.example`**: env vars documented in `README.md`.

## Env vars

- `NEXT_PUBLIC_API_URL` — backend base URL. Defaults to `http://localhost:8080`
  if missing. `NEXT_PUBLIC_*` vars are inlined at build time.

## Deploy

GCP **Cloud Run** (containerized Next.js, scale-to-zero), unified with the
backend. Vercel is the documented fallback if Cloud Run becomes painful.

- `Dockerfile` is multi-stage (deps → builder → runner) and emits a
  Next.js `output: 'standalone'` bundle. Final image ~180 MB.
- `.github/workflows/deploy.yml` builds + pushes to Artifact Registry +
  deploys to Cloud Run on every push to `main`. Auth via Workload
  Identity Federation — **no JSON keys**.
- `NEXT_PUBLIC_*` vars are baked at build time, so the deploy workflow
  passes `BACKEND_API_URL` as a Docker build-arg.

GCP setup commands and the GitHub Variables/Secrets to set are in
`README.md` under "Deploy".

## Project doc home

Architecture decisions, decision log, and state-of-the-app live at
`stadera-web/.claude/docs/` once that grows. The cross-repo source of truth
(roadmap, milestones) is `stadera/.claude/docs/architecture.md` in the
backend repo.
