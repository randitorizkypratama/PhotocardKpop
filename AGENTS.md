# AGENTS.md

## Project

K-pop photocard price tracker (Pocamarket → Turso; groups: IVE, aespa, Hearts2Hearts). Live: https://kpop-tracker-six.vercel.app. GitHub: https://github.com/randitorizkypratama/PhotocardKpop.

**Do not `git push` or deploy (`npx vercel --prod`) unless the user explicitly says so.**

## Layout

- Monorepo root: bun workspaces (`apps/*`); scripts delegate via `bun run --cwd apps/kpop-tracker …`
- App: `apps/kpop-tracker` (Nuxt 4.5, Vue 3, Tailwind CSS **v3** pinned as `"tailwindcss": "3"` — never migrate to v4)

## Commands

Run from app dir (`apps/kpop-tracker`) unless noted. Every bash call on this Windows box needs:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
```

- Install / add deps: `bun install` / `bun add <pkg>` — **bun only**; `npm install` fails (`Cannot read properties of null (matches)`)
- Dev: `bun run dev` (root or app)
- Build: `npx nuxt build` — if build lock error, kill the PID from the message or set `NUXT_IGNORE_LOCK=1`
- Test: `bun run test` (vitest, `apps/kpop-tracker/tests/`); watch: `npx vitest`
- Smoke test: `bun run smoke [base-url]` — verifies prod endpoints/pages, exits non-zero on failure
- Search index rebuild: `node scripts/rebuild-index.mjs [--resume|--force]` (from `apps/kpop-tracker`) — downloads card images, sharpens them (`sharp` devDep), embeds with CLIP and rewrites `public/search/{index.bin,index.json}`; needs `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` from `.env` **or** the process env (CI has no `.env`). Checkpoint in `.index-checkpoint.json` + `.index-embeddings.bin` (gitignored, cached by the workflow).
- Deploy (only when user permits): **pushing `main` auto-deploys to production** (Vercel↔GitHub, Root Directory = `apps/kpop-tracker`); manual `npx vercel --prod --yes` from `apps/kpop-tracker` is the **rollback** tool when a git build is broken (retry once on "Not authorized", then wait ~10s and verify `/api/releases/timeline`).
- Typecheck: `bun run typecheck` (root delegates to app script `nuxt typecheck` via vue-tsc + typescript). **Must stay at 0 errors.** No lint/format tooling exists.

## Architecture

- `nuxt.config.ts`: `components: [{ path: '~/components', pathPrefix: false, ignore: ['**/ui/**/index.ts', '**/ui/**/interface.ts', '**/ui/**/use*.ts'] }]` — keeps `<Button>`, `<Card>` etc. resolving by filename and avoids NUXT_B3011 collisions. Do not remove `pathPrefix: false` or the ignore globs.
- UI: shadcn-vue on **reka-ui** (not radix-vue), deps in `apps/kpop-tracker/package.json`. Utils: `cn()` at `app/lib/utils.ts` → import as `@/lib/utils`.
- `components.json` → aliases `@/components`, `@/lib`. shadcn-vue CLI is broken here (registry fetch fails); add components by raw JSON: `Invoke-WebRequest https://shadcn-vue.com/r/styles/default/{name}.json` then write files into `app/components/ui/{name}/`.
- `tailwind.config.js` is **ESM** — `import tailwindcssAnimate from 'tailwindcss-animate'` (never `require`). Colors use `hsl(var(--…))` with shadcn vars in `app/assets/css/main.css`; keep custom component classes inside `@layer components` (an extra `}` there breaks the build).
- Pages: `app/pages/{index,browse,collection}.vue` + `app/pages/card/[id].vue`; shared header `app/components/AppHeader.vue` (`back`/`active` props); tab bar `MobileTabBar.vue`.
- Server: `server/api/*` (cards, collection, cron/sync, sync/group, init, exchangerate); DB client `server/utils/turso.ts`; Pocamarket `server/utils/pocamarket.ts`; FX `server/utils/exchangerate.ts`.
- Runtime env (server): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NUXT_PUBLIC_API_BASE_URL`, `CRON_SECRET`; example in `.env` / `.env.example` under `apps/kpop-tracker`.

## Data / API notes

- Pocamarket search: `https://pocamarket.com/apis/card/gb/v2/search?q=GROUP&page=1`; daily Vercel cron `0 17 * * *` UTC (= 00:00 WIB) → `POST /api/cron/sync`; ~16,203 cards in Turso.
- Releases: `cards.release_name` comes from matching the card name against the group's MusicBrainz discography (`server/utils/releases/discography.ts`, table `discography`, refreshed by the daily cron — 3 MB requests, 1 req/s limit). Version siblings (Japanese/English/track-video) merge into one entry, earliest date wins. The token list in `server/utils/pocamarket.ts` is only a fallback for when MB is unreachable; `getGroupDiscography` falls back to the stale cache first. `cards_release_name_backup` holds pre-migration labels (rollback).
- `/api/releases/timeline` and `/api/releases/detail` read the discography **first**, so releases with zero photocards still render ("No cards yet"); `app/pages/releases/` is the timeline + album pages. Timeline rows carry an `artwork` field (Apple Music/iTunes via `release_cache`,600×600) with the card image as fallback — render `release.artwork || release.image`. The timeline supports `?group=` / `?type=` filters.
- `/api/sync/status` → `{ last_synced, total, last_run }` from `MAX(cards.updated_at)` — drives the "Synced …" badge in `SiteFooter.vue`. `last_run` reads `sync_log` (one row per `/api/cron/sync` run: `running` → `ok`/`partial`/`error`); the footer only shows an amber/red line when the last run failed, was partial, or stays `running` >15 min (function killed mid-sync). Table is created on first cron run.
- Manual calls to `init`, `sync/group`, and `cron/sync` need `Authorization: Bearer <CRON_SECRET>` (fail-closed 401 when `CRON_SECRET` is unset).
- **Accounts (per-user)**: `/api/auth/{register,login,logout,me}` — scrypt hashes (`server/utils/password.ts`), DB-backed sessions in `sessions` (random 32-byte token, httpOnly cookie `hp_session`, 30-day TTL, `secure` only in production). Collections are scoped by `collections.user_id`: GET/POST/DELETE on `/api/collection*` all require a session (401 otherwise); writes additionally require an allowed `Origin` (`https://kpop-tracker-six.vercel.app`, `http://localhost:3000`, `http://127.0.0.1:3000` — curl tests must send `-H "Origin: http://localhost:3000"`). The first registered account inherits all pre-login rows (`UPDATE collections SET user_id = … WHERE user_id IS NULL`) **and becomes the admin** (`users.role`; assigned atomically on insert + idempotent backfill in `ensureAuthTables()`). Only the admin can open `/status` (client gate + footer/palette links hidden for others) and call `GET /api/errors` / `GET /api/sync/history` (`requireAdmin`, 403 otherwise). Login/register are capped at 15 attempts / 10 min per IP (`checkAuthAttempt`) on top of the global limits. `ensureAuthTables()` (`server/utils/turso.ts`) creates users/sessions/error_log and swaps the collections unique index to `(user_id, card_id, status)` once per process, so auth works before `/api/init` runs.
- Error monitoring: Nitro `error` hook (`server/plugins/errorlog.ts`) + client reporter (`app/plugins/error-report.client.ts`) → `POST /api/errors` into table `error_log` (self-creating, capped at 500 rows); `GET /api/errors` (admin only) feeds the "Recent errors" panel on `/status`.
- `/api/tiktok/products` and `/api/tiktok/videos` (third-party quota burners) use `requireSameOriginRead`: they accept `Origin` **or** a `Referer` from the allowlist, so the shop page works (browsers send same-origin `Referer` under our Referrer-Policy) while headerless curl gets 403. `/api/tiktok/callback` must stay unguarded (OAuth redirect from TikTok carries neither header).
- All `/api/**` requests are rate-limited in memory (`server/middleware/ratelimit.ts`): 300 reads + 60 writes per minute per IP **per serverless instance** (best-effort; 429 past the budget). Security headers (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS, partial CSP) come from `nitro.routeRules` in `nuxt.config.ts`.
- Currency: IDR primary; rates from Frankfurter with fallback 17800; price `0` renders as "Tidak tersedia".
- Branding: HIBIKISHOP (`public/hibikishop-logo.png`); outbound POCAMARKET links → `https://pocamarket.com`. Social: Tokopedia/Shopee/TikTok URLs live in `SocialLinks` / footer components; assets under `public/social/`.

## Platform quirks

- PowerShell: `$home` is read-only; no `Join-String`; prefer `ConvertFrom-Json` for JSON; use the grep tool over complex quoted regex in bash.
- `bun add` of `@unovis/*` fails (integrity errors) — chart component was abandoned; do not retry without a different approach.
- Two CI workflows exist: `.github/workflows/security-audit.yml` (monthly `bun audit` + manual dispatch — audit only, never deploys) and `.github/workflows/rebuild-index.yml` (Sunday 00:00 UTC + manual `workflow_dispatch`, `force` input) which **does deploy**: it rebuilds the identify index and commits `public/search/*` to `main`. It resumes from a checkpoint kept in `actions/cache` (saved with `if: always()`, skipped when `force`), and its commit step re-syncs onto `origin/main` with a push retry loop because the rebuild takes hours. No ESLint/Prettier/Biome, no pre-commit hooks in this repo.
