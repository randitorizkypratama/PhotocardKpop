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
- Deploy (only when user permits): `npx vercel --prod --yes` from `apps/kpop-tracker`
- No lint / typecheck / test scripts exist. Root `typecheck` script points at a non-existent app script — ignore it.

## Architecture

- `nuxt.config.ts`: `components: [{ path: '~/components', pathPrefix: false, ignore: ['**/ui/**/index.ts', '**/ui/**/interface.ts', '**/ui/**/use*.ts'] }]` — keeps `<Button>`, `<Card>` etc. resolving by filename and avoids NUXT_B3011 collisions. Do not remove `pathPrefix: false` or the ignore globs.
- UI: shadcn-vue on **reka-ui** (not radix-vue), deps in `apps/kpop-tracker/package.json`. Utils: `cn()` at `app/lib/utils.ts` → import as `@/lib/utils`.
- `components.json` → aliases `@/components`, `@/lib`. shadcn-vue CLI is broken here (registry fetch fails); add components by raw JSON: `Invoke-WebRequest https://shadcn-vue.com/r/styles/default/{name}.json` then write files into `app/components/ui/{name}/`.
- `tailwind.config.js` is **ESM** — `import tailwindcssAnimate from 'tailwindcss-animate'` (never `require`). Colors use `hsl(var(--…))` with shadcn vars in `app/assets/css/main.css`; keep custom component classes inside `@layer components` (an extra `}` there breaks the build).
- Pages: `app/pages/{index,browse,collection}.vue` + `app/pages/card/[id].vue`; shared header `app/components/AppHeader.vue` (`back`/`active` props); tab bar `MobileTabBar.vue`.
- Server: `server/api/*` (cards, collection, cron/sync, sync/group, init, exchangerate); DB client `server/utils/turso.ts`; Pocamarket `server/utils/pocamarket.ts`; FX `server/utils/exchangerate.ts`.
- Runtime env (server): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NUXT_PUBLIC_API_BASE_URL`; example in `.env` / `.env.example` under `apps/kpop-tracker` (README's `apps/web/` path is stale).

## Data / API notes

- Pocamarket search: `https://pocamarket.com/apis/card/gb/v2/search?q=GROUP&page=1`; daily Vercel cron `0 17 * * *` UTC (= 00:00 WIB) → `POST /api/cron/sync`; ~16,203 cards in Turso.
- Currency: IDR primary; rates from Frankfurter with fallback 17800; price `0` renders as "Tidak tersedia".
- Branding: HIBIKISHOP (`public/hibikishop-logo.png`); outbound POCAMARKET links → `https://pocamarket.com`. Social: Tokopedia/Shopee/TikTok URLs live in `SocialLinks` / footer components; assets under `public/social/`.

## Platform quirks

- PowerShell: `$home` is read-only; no `Join-String`; prefer `ConvertFrom-Json` for JSON; use the grep tool over complex quoted regex in bash.
- `bun add` of `@unovis/*` fails (integrity errors) — chart component was abandoned; do not retry without a different approach.
- No CI workflows, no ESLint/Prettier/Biome, no pre-commit hooks in this repo.
