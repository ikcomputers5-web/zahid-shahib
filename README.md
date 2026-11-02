# Ismail Elegance

A complete storefront + admin panel for **Ismail Elegance**, a Lahore atelier selling lawn, luxury pret, formals and bridal. Built as a single Node/Express app with a hand-written design system — no framework, no build step.

```
Ismail Elegance
├── storefront   /            hero slider, new drops, categories, trending, quiz, wishlist…
├── checkout     /checkout    promo codes, delivery threshold, order numbers
└── admin        /admin       products, orders, promos, storefront content, contact & socials
```

## Quick start

```bash
npm install
npm start          # http://localhost:3000
```

The database is created and seeded automatically on first boot (`data/db.json`). To wipe everything and start from the demo catalogue again:

```bash
npm run seed
```

`npm run dev` runs the same server with Node's watch mode.

### Admin

- URL: **http://localhost:3000/admin**
- Password: **`ismail2026`**

Set `ADMIN_PASSWORD` before the first boot to seed a different password, or change it inside the panel under **Settings → Password**. It is stored as a scrypt hash; sessions live for 12 hours and are throttled after repeated failed attempts.

> There is no real payment gateway. Checkout records the order and payment method (cash on delivery, bank transfer, card on delivery) — the confirmation page states this plainly.

## What's in the storefront

- **Hero slider** with three campaign slides, drop countdown and trust strip.
- **New drops** rail driven by the `isDrop` flag, with badges and compare-at pricing.
- **The house edit** category mosaic, **trending** tabbed rail, editorial story block, Instagram strip, customer notes, newsletter and quiz panels.
- **Shop** with category / collection / price / size filters, sorting, search overlay (`/` shortcut) and recently viewed.
- **Product page** with gallery, colour and size selection, stock status, size guide, delivery estimate, reviews and related pieces.
- **Cart drawer + cart page** with quantity edits, free-delivery meter, promo code, save-for-later and a copyable code.
- **Checkout** with validation, delivery estimate and an order confirmation page (`/order/IE-XXXXXX`).
- **Order tracking** by order number + phone (`/track`).
- **Wishlist**, **style quiz** (three questions → a personalised edit), **journal-style about page**, **contact page** and a 404.
- Promo codes, WhatsApp deep links, newsletter and contact forms, and a fully responsive layout from 390 px up.

## What the owner can change in the admin

| Area | Controls |
| --- | --- |
| Dashboard | Revenue, orders, average order, audience, 14-day chart, top pieces, recent orders |
| Products | Create / edit / duplicate / delete, stock, prices, sizes, colours, images (URL or upload), badges, details |
| Orders | Filter by status, open an order, advance it through placed → confirmed → packed → shipped → delivered / cancelled, export CSV |
| Promo codes | Percent, fixed and free-shipping codes, minimum order, expiry, usage caps, on/off |
| Storefront | Store name, tagline, announcement bar, hero slides, drop countdown, story copy, images, Instagram strip |
| Contact & social | Phone, WhatsApp, email, address, hours, Instagram / Facebook / TikTok / Pinterest / YouTube |
| Messages | Contact-form inbox, mark read, reply by email |
| Audience | Newsletter subscribers + drop-alert signups, CSV export |
| Settings | Delivery threshold and fee, return window, password change |

On a persistent Node host, every save is written to the JSON store and is live on the storefront immediately. Vercel deployments are read-only previews; see below.

## Deploying on Vercel

Vercel functions have a read-only deployment filesystem, and their temporary storage is not durable or shared between instances. How the app behaves on Vercel therefore depends on whether Supabase is configured:

- **Without Supabase env vars** the app starts with the built-in demo catalogue in **read-only preview mode**. Browsing and promo validation work, but orders, contact forms, subscriptions, admin login/changes and uploads return a 503 instead of appearing to succeed and then losing data. The storefront displays a preview notice.
- **With Supabase env vars** (see below) the whole JSON database is kept as a single `db.json` object in a **private** Supabase Storage bucket (`SUPABASE_DB_BUCKET`, default `store-db`), and admin sessions are stateless HMAC-signed tokens (secret: `SESSION_SECRET`, or derived from the admin password hash — so changing the password logs everyone out). Orders, contact/subscribe forms, admin login and all admin edits then work on Vercel. Uploads go to the public image bucket as described below.

Two caveats in remote mode: concurrent serverless requests can race on the shared JSON (last write wins — fine for a boutique store, but use a real database if order volume grows), and the brute-force login limiter is per-instance best-effort. On a persistent Node host none of this applies — `data/db.json` is used directly and everything is writable. Always change the default admin password (`ismail2026`) before making a writable installation public.

## Image storage (Supabase)

Admin image uploads are written to `public/uploads/` by default. To keep them in **Supabase Storage** instead (required on Vercel, where the filesystem is read-only):

1. In Supabase: **Storage → New bucket** named `product-images` and mark it **public** (product photos are public anyway).
2. For the database on Vercel, also create a second bucket named `store-db` and keep it **private** — it holds the whole JSON database, including the admin password hash and customer orders.
3. **Project Settings → API**: copy the project URL and the **secret key** (`sb_secret_...` under "Secret keys"; the legacy `service_role` key also works).
4. Set these environment variables on Vercel (Settings → Environment Variables):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_BUCKET=product-images   # optional, this is the default
SUPABASE_DB_BUCKET=store-db      # optional, this is the default
SESSION_SECRET=a-long-random-string   # optional; see "Deploying on Vercel"
```

With these set, the Vercel deployment is fully writable (orders, admin, uploads). Without them, Vercel falls back to the read-only preview described above. On a writable Node host without Supabase, uploads and the database stay on local disk. See `.env.example`.

## Project layout

```
server.js              Express app, static files, SPA fallback, error handler
src/
  db.js                JSON store: local file, or Supabase bucket on serverless hosts
  seed.js              Categories, 22 products, 4 promo codes, settings, copy
  auth.js              scrypt password hashing, 12-hour stateless signed sessions
  storage.js           Supabase Storage client: image uploads + remote db.json
  commerce.js          Promo evaluation, totals, line pricing
  routes/public.js     /api — bootstrap, products, promos, orders, contact, subscribe
  routes/admin.js      /api/admin — auth, CRUD, uploads, stats, settings
public/
  index.html           Storefront shell
  admin.html           Admin shell
  css/styles.css       Storefront design system
  css/admin.css        Admin design system
  js/api.js            fetch wrapper
  js/state.js          Cart, wishlist, promo, recently viewed (localStorage)
  js/nav.js            History-API router helpers
  js/ui.js             Icons, chrome, cards, drawer, search, modals
  js/pages.js          Every page view
  js/router.js         Routes + error boundary
  js/main.js           Boot, global handlers, shortcuts
  js/admin.js          Admin login, views, modals, uploads
  images/products/     Product photography
  images/boutique/     Atelier / salon photography
  uploads/             Admin image uploads (git-ignored)
  fonts/               Self-hosted Jost + Cormorant Garamond (no CDN)
```

## Notes

- **No CDNs.** Fonts and images are served from the app itself, so it works offline.
- **Storage.** `data/db.json` is the whole database. Delete it (or run `npm run seed`) to reset. It is git-ignored, so a fresh clone starts from the seed.
- **Uploads** from the admin (`POST /api/admin/upload`) are written to `public/uploads/` and capped at 6 MB.
- **Deploying.** Any Node host works: `PORT` is respected, the server binds to `0.0.0.0`, and `NODE_ENV=production` is enough to run behind a reverse proxy. Point the process at persistent storage if you want the JSON file to survive redeploys.
