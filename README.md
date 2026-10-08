# photos-vegvisr

Photo management single-page app for the Vegvisr ecosystem. React 19 + TypeScript + Vite, styled with Tailwind, built on `vegvisr-ui-kit`. Deployed as a static bundle to Cloudflare Pages; all persistence is delegated to Vegvisr Cloudflare Workers.

## What the app does

The entire UI is implemented in [src/App.tsx](./src/App.tsx) (~2.7k lines, single `App` component). Feature surface:

**Auth**
- Magic-link sign-in against `cookie.vegvisr.org` via `authClient` from `vegvisr-ui-kit`.
- On verify, fetches role + user data from `dashboard.vegvisr.org` and stores the user in `localStorage`. The user's `emailVerificationToken` is sent as an `X-API-Token` header on subsequent API calls.
- Roles drive visibility: `Superadmin` sees all albums (with a "Show only my albums" toggle); `Admin` sees only their own.

**Library / gallery**
- Lists images from `photos-api.vegvisr.org/list-r2-images`, grouped into a timeline by month and day (most-recent month expanded, older months auto-collapsed).
- Date is parsed from the `uploaded` field, a 13-digit millisecond timestamp in the key, or a 10-digit second timestamp; everything else is bucketed under "Other".
- Per-image actions: copy URL, download, edit metadata, generate favicon set, delete (sends to trash).
- Lightbox viewer with keyboard nav (`Esc` / `←` / `→`).

**Upload**
- Drag-and-drop, paste from clipboard, and a file picker. All routes through `photos-api.vegvisr.org/upload` with multipart form data.
- Dropping a `text/uri-list` or `text/plain` URL fetches the remote image and re-uploads it (enables cross-tab drops from other Vegvisr apps).
- Optional asset name + comma-separated tags are sent with the upload. Multi-file uploads with a base name get auto-suffixed (`name-01`, `name-02`).

**Metadata editor**
- Per-image modal to edit `name`, `displayName`, and tags. PATCH → POST fallback against `photos-api.vegvisr.org/image-metadata`; on failure, persists to `localStorage` under `photos-image-metadata` so the label survives reloads in this browser.
- "Suggest" button rasterizes the image to a data URL (SVGs go through a canvas) and POSTs it to `photos-api.vegvisr.org/suggest-image-metadata` for an AI-generated label + tag set, then pre-fills the form for review.

**Albums**
- Create / rename / select against `albums.vegvisr.org/photo-album(s)`.
- Drag photos onto an album button to add them; multi-select with Shift/Cmd/Ctrl-click for batch drag.
- "Add images" picker shows all uploaded images and flags which are already in the selected album.
- SEO panel writes `seoTitle`, `seoDescription`, and `seoImageKey` to the album record, flips `isShared: true`, and renders a live Open Graph preview. Share link format: `https://seo.vegvisr.org/album/{shareId}`. "Regenerate link" rotates `shareId`.

**Public share view**
- When loaded at `/share/{albumName}`, the app switches to share mode: hides the album/upload sidebar, fetches the album by share ID, and renders the gallery read-only.

**Trash**
- Lists soft-deleted items from `photos-api.vegvisr.org/trash/list`.
- Restore (optionally directly into a chosen album) or delete forever.

**Favicon generator**
- For any image, downscales to 32×32, 180×180, and 512×512 via `<canvas>` and uploads each PNG to `photos-api.vegvisr.org/upload-favicon` under `favicons/{baseName}-{stamp}-{NxN}.png`.
- Modal displays the URLs plus a ready-to-paste `<link rel="icon" ...>` HTML snippet, with copy buttons for both.
- Re-opens for the same image reuse cached URLs via `photos-api.vegvisr.org/favicons?prefix=...` so the set is generated only once.

**i18n**
- `LanguageContext` + `useTranslation` support `en`, `no`, `is`, `nl`. Current keys are minimal (`app.title`, `app.badge`); most UI strings are still hard-coded English.
- Selection persists in `localStorage` under `vegvisr_language`.

## External services it depends on

| Service | Used for |
|---|---|
| `cookie.vegvisr.org` | Magic-link issue + verify |
| `dashboard.vegvisr.org` | `/get-role`, `/userdata` |
| `photos-api.vegvisr.org` | R2 list / upload / delete / trash / image-metadata / suggest-image-metadata / upload-favicon / favicons |
| `albums.vegvisr.org` | `/photo-albums`, `/photo-album`, `/photo-album/add`, `/photo-album/remove` |
| `seo.vegvisr.org` | Public share URLs |
| `vegvisr.imgix.net` | Image CDN (SEO cover preview) |

All endpoint URLs are hard-coded as constants at the top of `App.tsx`.

## Scripts

CLI helpers for housekeeping against the production photos API.

- **`scripts/duplicate-image-scan.mjs`** — Lists images from the API, hashes each thumbnail with a perceptual hash (`sharp`, 9×8 grayscale → 64-bit dHash), and reports pairs within a Hamming distance threshold. Writes a JSON report to `scripts/duplicate-report.json`.
  ```
  node scripts/duplicate-image-scan.mjs \
    --threshold 5 --concurrency 6 [--limit N] [--output path.json]
  ```
- **`scripts/trash-duplicates.mjs`** — Reads the report and DELETEs one side of each duplicate pair via `photos-api.vegvisr.org/delete-r2-image` (which is a soft-delete — items go to trash, recoverable from the UI). Dry-run by default.
  ```
  node scripts/trash-duplicates.mjs --keep a            # dry run
  node scripts/trash-duplicates.mjs --keep a --apply    # actually trash
  ```

## Project Documentation

- [CLAUDE.md](./CLAUDE.md) — Project-specific Claude Code instructions
- [_project/lessons_learned.md](./_project/lessons_learned.md) — Engineering discipline & failure patterns (read first per response)
- [_project/STATUS.md](./_project/STATUS.md) — Current state & progress log
- [_project/TODO.md](./_project/TODO.md) — Remaining slices
- [_project/PLAN.md](./_project/PLAN.md) — Implementation plan
- [_project/TEST_PLAN.md](./_project/TEST_PLAN.md) — Test regime

## Run Locally

```bash
npm install
npm run dev       # Vite dev server
npm run lint      # ESLint
npm run build     # tsc -b && vite build → dist/
npm run preview   # Serve the production build
```

Requires Node.js 18+.

## Tech Stack

- **Runtime:** React 19, TypeScript 5.9, Vite 7
- **Styling:** Tailwind CSS 3, PostCSS, Autoprefixer
- **UI / auth:** `vegvisr-ui-kit` ^1.4.0 (`AuthBar`, `BrandLogo`, `EcosystemNav`, `LanguageSelector`, `authClient`)
- **Tooling:** ESLint 9, `sharp` 0.34 (duplicate-scan script only)
- **Deployment:** Cloudflare Pages (`wrangler.toml` → `pages_build_output_dir = "dist"`)
