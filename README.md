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
- Sign-in: your admin **email + password**, or **Continue with Google** (Firebase).

**The password is not in this repository and is never shown on the login screen.** Set it privately for your installation:

```bash
# first boot — set the password through the environment
ADMIN_PASSWORD='choose-a-strong-one' ADMIN_EMAIL=you@example.com npm start

# or, on an existing installation (writes only a scrypt hash to data/db.json)
npm run admin:password -- "choose-a-strong-one"
npm run admin:password -- --generate     # let it make and print one
npm run admin:password -- --email you@example.com
```

If no `ADMIN_PASSWORD` is provided, a random one is generated on first boot and printed **once** in the server console. `ADMIN_PASSWORD` / `ADMIN_EMAIL` from the environment are authoritative: changing the variable applies the new credentials on the next boot (tracked with a keyed tag, so a password changed in the panel is never silently reverted unless the env var still holds a different value). Alternatively change it inside the panel under **Settings → Admin password**. It is stored as a scrypt hash; sessions live for 12 hours and are throttled after repeated failed attempts.

**Google login for admins (Firebase):** The admin panel also supports **Sign in with Google** via Firebase Authentication. Configure Firebase env vars (see below) and authorized admin emails (`ADMIN_EMAILS`); then click **Continue with Google** on the admin login screen. The Firebase token is verified server-side with `firebase-admin` and exchanged for a local admin session cookie.

> There is no real payment gateway. Checkout records the order and payment method (cash on delivery, bank transfer, card on delivery) — the confirmation page states this plainly.

### Firebase Authentication (Google Sign-In)

Both the **storefront checkout** and the **admin panel** support Firebase Google authentication.

**What it does:**
- **Ordering:** When Firebase is configured (`FIREBASE_API_KEY` + `FIREBASE_PROJECT_ID`), the checkout is gated — customers must **sign in with Google** before they can place an order. Their Firebase `uid`, email, name and photo are attached to the order (`userUid`, `userEmail`) and shown in the admin Orders view. Without Firebase env vars, guest checkout still works (demo mode).
- **Admin:** Admins can sign in with Google in addition to the password. Restrict access with `ADMIN_EMAILS=admin@example.com,owner@gmail.com`.

**Setup (2 minutes):**

1. In [Firebase Console](https://console.firebase.google.com/) → create a project → **Authentication → Sign-in method → enable Google**.
2. **Authentication → Settings → Authorized domains** — add your domain (`localhost` is allowed by default, add your Vercel/hosting domain for production).
3. **Project Settings → General → Your apps → Web app** — copy the SDK config.
4. **Project Settings → Service accounts → Generate new private key** — download the JSON.

Set these in `.env` (or Vercel → Settings → Environment Variables):

```env
# Client (public) — from step 3
FIREBASE_API_KEY=AIzaSy...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456...
FIREBASE_APP_ID=1:123456:web:abc123

# Server (secret) — from step 4 — pick ONE format:
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
# or
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# or: FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccountKey.json

# Optional: restrict which Google accounts can access /admin
ADMIN_EMAILS=admin@ismailelegance.pk,owner@gmail.com
```

Restart the server (`npm run dev`). The storefront header will show **Sign in** and the checkout will require Google login; the admin login page will enable the Google button. See `.env.example` for all options.

**Local dev without Firebase:** Leave the `FIREBASE_*` vars empty — guest checkout and password login keep working.

**Production tokens are always verified.** Google ID tokens are accepted only after the Admin SDK verifies their signature. For local experiments without a service account you can opt into unverified decoding with `FIREBASE_ALLOW_INSECURE_DECODE=1`; that flag is ignored when `NODE_ENV=production`, so a forged token can never open the admin panel.

**Check a deployment at any time:** open `/api/health` (or **Admin → Settings → System check**). It reports — with no secrets — whether the Firebase browser config, the Admin SDK credentials, the admin allow-list and the database/storage are wired up, plus the exact problem when something is missing. The same information powers the System check card, including the commit the deployment was built from.

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
| Products | Create / edit / duplicate / delete, stock, prices (typed or with − / + steppers, commas accepted), sizes and colours added one row at a time, gallery with multiple uploads + reorder, badges, details, care |
| Orders | Filter by status, open an order, advance it through placed → confirmed → packed → shipped → delivered / cancelled, export CSV |
| Promo codes | Percent, fixed and free-shipping codes, minimum order, expiry, usage caps, on/off |
| Storefront | Store name, tagline, announcement bar, up to 8 hero slides, drop countdown, story copy, house values (add/remove up to 6), images, Instagram strip |
| Contact & social | Phone, WhatsApp, email, address, hours, Instagram / Facebook / TikTok / Pinterest / YouTube |
| Messages | Contact-form inbox, mark read, reply by email |
| Audience | Newsletter subscribers + drop-alert signups, CSV export |
| Settings | Delivery threshold and fee, return window, password change |

On a persistent Node host, every save is written to the JSON store and is live on the storefront immediately.

### Using the admin on a phone

The admin is a first-class mobile layout: the sidebar becomes a drawer, tables turn into stacked cards (with the column name above each value), number fields get large − / + buttons, and every modal is full-screen with a sticky save bar. Form fields render at 16 px on small screens so iOS Safari does not zoom the page when you tap a number — the main reason a price or stock field can feel impossible to edit on a phone.

## Deploying on Vercel

Vercel functions have a read-only deployment filesystem, and their temporary storage is not durable or shared between instances. How the app behaves on Vercel therefore depends on whether Supabase is configured:

**Set each variable for Production _and_ Preview (and Development).** Vercel scopes an env var to the environments you tick, and a preview deployment with no `FIREBASE_*` values shows the Google button as "not configured" — and, without Supabase, works in read-only mode. All variables in the `zahid-shahib` project now target all three environments. Note that previews then share the live Supabase database, so avoid editing content from an old preview branch.

- **Without Supabase env vars** the app starts with the built-in demo catalogue in **read-only preview mode**. Browsing and promo validation work, but orders, contact forms, subscriptions, admin login/changes and uploads return a 503 instead of appearing to succeed and then losing data. The storefront displays a preview notice.
- **With Supabase env vars** (see below) the whole JSON database is kept as a single `db.json` object in a **private** Supabase Storage bucket (`SUPABASE_DB_BUCKET`, default `store-db`), and admin sessions are stateless HMAC-signed tokens (secret: `SESSION_SECRET`, or derived from the admin password hash — so changing the password logs everyone out). Orders, contact/subscribe forms, admin login and all admin edits then work on Vercel. Uploads go to the public image bucket as described below.

Two caveats in remote mode: concurrent serverless requests can race on the shared JSON (last write wins — fine for a boutique store, but use a real database if order volume grows), and the brute-force login limiter is per-instance best-effort. On a persistent Node host none of this applies — `data/db.json` is used directly and everything is writable. The admin password is not stored in this repository: set `ADMIN_PASSWORD` (and `ADMIN_EMAIL`) as environment variables on the host so every instance can sign in.

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
  auth.js              scrypt password hashing, 12-hour stateless signed sessions + Firebase guards
  firebase.js          Firebase Admin: token verification, client config, env helpers
  storage.js           Supabase Storage client: image uploads + remote db.json
  commerce.js          Promo evaluation, totals, line pricing
  routes/public.js     /api — bootstrap, products, promos, orders, contact, subscribe + /auth/google, /my/orders
  routes/admin.js      /api/admin — auth, CRUD, uploads, stats, settings + /firebase-login, /users
public/
  index.html           Storefront shell
  admin.html           Admin shell
  css/styles.css       Storefront design system
  css/admin.css        Admin design system
  js/api.js            fetch wrapper (attaches Firebase ID token)
  js/state.js          Cart, wishlist, promo, recently viewed, user (localStorage)
  js/firebase.js       Firebase client: Google popup, token, user sync
  js/nav.js            History-API router helpers
  js/ui.js             Icons, chrome, cards, drawer, search, modals, auth header
  js/pages.js          Every page view + checkout auth gate + /account (my orders)
  js/router.js         Routes + error boundary
  js/main.js           Boot, Firebase init, global handlers, shortcuts
  js/admin.js          Admin login (password + Google), views, modals, uploads
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
- **SEO.** `/sitemap.xml` is generated from the live catalogue (storefront pages, one URL per category and per product) and `/robots.txt` points to it while keeping `/admin`, `/api/` and per-user pages out. Set `SITE_URL` (e.g. on Vercel) so the sitemap uses your real domain instead of the deployment alias.
- **Meta Pixel.** The snippet in the repo-root **`pixel`** file (editable directly on GitHub) is injected into the storefront `<head>` on every page, and SPA navigations fire an extra `PageView`. Alternatively set `META_PIXEL_ID` (numeric ID from Meta Events Manager), which takes precedence over the file; with neither configured, no pixel is injected. Use `trackEvent('Purchase', { value, currency: 'PKR' })` from `public/js/pixel.js` to fire standard events (e.g. after a successful order).
