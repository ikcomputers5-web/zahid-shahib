'use strict';

const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

/* ------------------------------------------------------- admin credentials
 *
 * The admin password is deliberately absent from this source tree, from
 * .env.example and from the login screen. It is resolved in this order:
 *
 *   1. ADMIN_PASSWORD (and ADMIN_EMAIL) — set it in your host's env/.env.
 *   2. A one-time random password generated on first boot and printed once to
 *      the server console, so a fresh clone never ships with a known password.
 *
 * `npm run admin:password -- "<new>"` changes it on an existing installation.
 */

let generatedPassword = null;
let generatedPasswordUnannounced = false;

function generatedSeedPassword() {
  if (!generatedPassword) {
    generatedPassword = crypto.randomBytes(9).toString('base64url');
    generatedPasswordUnannounced = true;
  }
  return generatedPassword;
}

/**
 * Hands back the generated first-boot password once, so the caller can print
 * it — but only if it is still the password in use (an operator who set one
 * with the CLI or env must not be shown a stale throwaway).
 */
function takeGeneratedPassword() {
  if (!generatedPasswordUnannounced) return null;
  generatedPasswordUnannounced = false;
  return generatedPassword;
}

/**
 * Tag identifying the ADMIN_PASSWORD value the stored hash was last synced
 * from. Storing only a keyed hash means a changed env var is detected (and
 * applied once) without keeping the password itself anywhere in the database.
 */
function adminPasswordEnvTag(password, settings = {}) {
  const key = process.env.SESSION_SECRET || settings.adminPasswordSalt || 'ismail-elegance';
  return crypto.createHmac('sha256', key).update(`admin-password:${password}`).digest('hex').slice(0, 20);
}

/**
 * Makes ADMIN_PASSWORD / ADMIN_EMAIL authoritative exactly once per value.
 * Runs on boot: if the operator sets or changes ADMIN_PASSWORD, the stored
 * hash is replaced by that password; afterwards the tag matches and this is a
 * no-op, so a password changed from the admin panel is never reverted.
 *
 * @returns {boolean} true when `db` was modified (caller should persist it)
 */
function applyAdminEnvCredentials(db) {
  const password = process.env.ADMIN_PASSWORD;
  if (!db || !db.settings || !password) return false;
  const settings = db.settings;
  const tag = adminPasswordEnvTag(password, settings);
  if (settings.adminPasswordEnvTag === tag && settings.adminPasswordHash) return false;

  const { salt, hash } = hashPassword(password);
  settings.adminPasswordSalt = salt;
  settings.adminPasswordHash = hash;
  settings.adminPasswordEnvTag = tag;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (email) settings.adminEmail = email;
  console.log('[admin] Admin sign-in credentials synced from ADMIN_PASSWORD / ADMIN_EMAIL.');
  return true;
}

function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString();
}

function adminSeedPassword() {
  return process.env.ADMIN_PASSWORD || generatedSeedPassword();
}

/** Fresh scrypt credentials for a database that has none yet. */
function newAdminCredentials() {
  return hashPassword(adminSeedPassword());
}

function buildSeed() {
  const password = adminSeedPassword();
  const { salt, hash } = hashPassword(password);

  const categories = [
    { slug: 'new-drops', name: 'New Drops', blurb: 'Fresh off the atelier floor', image: '/images/products/bridal-sahar.jpg', order: 0 },
    { slug: 'lawn', name: 'Lawn & Summer', blurb: 'Airy weaves for sunlit days', image: '/images/products/lawn-rania.jpg', order: 1 },
    { slug: 'pret', name: 'Luxe Pret', blurb: 'Ready to wear, ready to go', image: '/images/products/pret-elan.jpg', order: 2 },
    { slug: 'formals', name: 'Formals', blurb: 'For the evenings that matter', image: '/images/products/formal-shab.jpg', order: 3 },
    { slug: 'bridal', name: 'Bridal', blurb: 'Heirloom craftsmanship', image: '/images/products/bridal-meher.jpg', order: 4 },
    { slug: 'unstitched', name: 'Unstitched', blurb: 'Fabric, in your hands', image: '/images/products/unstitched-bagh.jpg', order: 5 },
    { slug: 'accessories', name: 'Accessories', blurb: 'The finishing note', image: '/images/products/jewellery-kundan.jpg', order: 6 }
  ];

  const products = [
    {
      id: 'p_noor_jahan',
      slug: 'noor-jahan-ivory-bridal',
      name: 'Noor Jahan',
      subtitle: 'Ivory hand-embellished bridal pishwas',
      category: 'bridal',
      collection: "Zar Gul · Festive '26",
      price: 285000,
      compareAt: 320000,
      images: ['/images/products/bridal-noor-jahan.jpg', '/images/products/bridal-meher.jpg'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ name: 'Ivory Gold', hex: '#e8dfd0' }, { name: 'Pearl', hex: '#f4efe6' }],
      fabric: 'Raw silk with net dupatta',
      pieces: '3 Piece',
      description:
        'A floor-sweeping pishwas cut from raw silk and worked by hand with zardozi, dabka and pearl detailing. The sheer net dupatta carries a scalloped border finished in antique gold.',
      details: [
        'Hand-embellished bodice with zardozi and pearl work',
        'Panelled pishwas skirt with weighted hem',
        'Net dupatta with scalloped hand-finished border',
        'Includes raw silk churidar',
        'Made to order in 4–6 weeks'
      ],
      care: ['Dry clean only', 'Store in the muslin bag provided', 'Avoid direct contact with perfume'],
      stock: 3,
      isNew: true,
      isDrop: true,
      featured: true,
      rating: 5,
      reviewCount: 18,
      tags: ['bridal', 'hand-embellished', 'made-to-order'],
      reviews: [
        { name: 'Ayesha K.', city: 'Lahore', rating: 5, text: 'The embroidery is unreal — every guest asked where it was from. The team sized it perfectly over WhatsApp.' },
        { name: 'Hira M.', city: 'Karachi', rating: 5, text: 'Wore it for my nikkah. Weightless for how much work is on it.' }
      ],
      createdAt: daysAgo(2)
    },
    {
      id: 'p_meher',
      slug: 'meher-gold-embellished',
      name: 'Meher',
      subtitle: 'Antique gold embellished bridal',
      category: 'bridal',
      collection: "Zar Gul · Festive '26",
      price: 245000,
      compareAt: null,
      images: ['/images/products/bridal-meher.jpg', '/images/products/bridal-sahar.jpg'],
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Antique Gold', hex: '#b39462' }, { name: 'Champagne', hex: '#e3d3b6' }],
      fabric: 'Tissue silk with organza dupatta',
      pieces: '3 Piece',
      description:
        'Molten gold tissue, embroidered front and back in tilla and sequin, with a hand-worked neckline that frames the face. Finished with a cascading organza dupatta.',
      details: [
        'Tilla and sequin embroidery on tissue silk',
        'Hand-worked neckline and sleeve borders',
        'Cascading organza dupatta with crystal edging',
        'Includes tissue lehnga and inner slip',
        'Made to order in 4–6 weeks'
      ],
      care: ['Dry clean only', 'Professional embroidery care', 'Store flat to protect tilla work'],
      stock: 2,
      isNew: true,
      isDrop: true,
      featured: true,
      rating: 5,
      reviewCount: 11,
      tags: ['bridal', 'gold', 'tilla'],
      reviews: [{ name: 'Mahnoor S.', city: 'Islamabad', rating: 5, text: 'Felt like a Mughal miniature. The gold is warm, not brassy.' }],
      createdAt: daysAgo(3)
    },
    {
      id: 'p_sahar',
      slug: 'sahar-ivory-gharara',
      name: 'Sahar',
      subtitle: 'Ivory hand-worked gharara set',
      category: 'bridal',
      collection: 'Nikkah Notes',
      price: 178000,
      compareAt: 195000,
      images: ['/images/products/bridal-sahar.jpg', '/images/products/bridal-noor-jahan.jpg'],
      sizes: ['XS', 'S', 'M', 'L'],
      colors: [{ name: 'Ivory', hex: '#efe7d8' }, { name: 'Blush', hex: '#dcc2b8' }],
      fabric: 'Organza with net dupatta',
      pieces: '3 Piece',
      description:
        'A soft ivory gharara layered in gathered organza, with pearl-dusted embroidery trailing down the panels. The kind of quiet bridal you can wear all night.',
      details: [
        'Pearl and sequin embroidery on organza',
        'Tiered gharara with scalloped hem',
        'Sheer dupatta with hand-finished crystal border',
        'Comes with fitted inner shirt',
        'Made to order in 4–5 weeks'
      ],
      care: ['Dry clean only', 'Steam gently, never press directly on embroidery'],
      stock: 4,
      isNew: true,
      isDrop: false,
      featured: true,
      rating: 5,
      reviewCount: 9,
      tags: ['bridal', 'nikkah', 'ivory'],
      reviews: [{ name: 'Zara A.', city: 'Lahore', rating: 5, text: 'Wore it for my mehndi after-party. So comfortable I forgot I was in bridal wear.' }],
      createdAt: daysAgo(5)
    },
    {
      id: 'p_zohra',
      slug: 'zohra-champagne-lehnga',
      name: 'Zohra',
      subtitle: 'Champagne crystal lehnga',
      category: 'bridal',
      collection: 'Nikkah Notes',
      price: 198000,
      compareAt: null,
      images: ['/images/products/bridal-zohra.jpg', '/images/products/bridal-gulrukh.jpg'],
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Champagne', hex: '#d8c3a2' }],
      fabric: 'Net with silk lining',
      pieces: '3 Piece',
      description:
        'A full-circle lehnga in warm champagne net, scattered with crystal florets and finished with a wide embroidered border. Cut to catch every light in the room.',
      details: ['Crystal and sequin floral spray across net', 'Full-circle lehnga with silk lining', 'Embroidered border and scalloped dupatta', 'Made to order in 4–6 weeks'],
      care: ['Dry clean only', 'Store flat, avoid hangers', 'Crystal work requires specialist care'],
      stock: 2,
      isNew: true,
      isDrop: true,
      featured: false,
      rating: 5,
      reviewCount: 7,
      tags: ['bridal', 'lehnga', 'crystals'],
      reviews: [],
      createdAt: daysAgo(6)
    },
    {
      id: 'p_gulrukh',
      slug: 'gulrukh-antique-gold-formal',
      name: 'Gulrukh',
      subtitle: 'Antique gold floor-length formal',
      category: 'formals',
      collection: 'Mehfil Nights',
      price: 86900,
      compareAt: 98000,
      images: ['/images/products/bridal-gulrukh.jpg', '/images/products/formal-shab.jpg'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ name: 'Antique Gold', hex: '#b09063' }, { name: 'Bronze', hex: '#8c6a44' }],
      fabric: 'Chiffon with tissue lining',
      pieces: '3 Piece',
      description:
        'A floor-length formal in antique gold chiffon with a finely embroidered bodice and sheer sleeves. Built for a wedding you are attending, not hosting.',
      details: ['Hand-embroidered bodice and cuffs', 'Flowing chiffon panels with tissue lining', 'Matching embroidered dupatta', 'Includes churidar'],
      care: ['Dry clean only', 'Hang in a cool, dry closet'],
      stock: 8,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.8,
      reviewCount: 23,
      tags: ['formals', 'wedding-guest'],
      reviews: [{ name: 'Sana T.', city: 'Faisalabad', rating: 5, text: 'Ordered 6 days before a wedding and it arrived stitched and perfect.' }],
      createdAt: daysAgo(24)
    },
    {
      id: 'p_shab',
      slug: 'shab-midnight-embroidered',
      name: 'Shab',
      subtitle: 'Midnight embroidered chiffon suit',
      category: 'formals',
      collection: 'Mehfil Nights',
      price: 64900,
      compareAt: null,
      images: ['/images/products/formal-shab.jpg', '/images/products/formal-laila.jpg'],
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Midnight', hex: '#1f2b33' }, { name: 'Deep Emerald', hex: '#1e3a32' }],
      fabric: 'Chiffon with silk slip',
      pieces: '3 Piece',
      description:
        'Deep midnight chiffon worked with tonal embroidery and a scattered diamante finish. Photographs beautifully in candlelight.',
      details: ['Tonal thread work with diamante accents', 'Sheer chiffon sleeves with embroidered cuffs', 'Silk slip included', 'Straight-cut trousers'],
      care: ['Dry clean only', 'Do not iron directly on embellishment'],
      stock: 10,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.9,
      reviewCount: 31,
      tags: ['formals', 'chiffon', 'evening'],
      reviews: [],
      createdAt: daysAgo(33)
    },
    {
      id: 'p_aab',
      slug: 'aab-printed-silk',
      name: 'Aab',
      subtitle: 'Rose-print silk kurta & dupatta',
      category: 'formals',
      collection: 'Bagh-e-Noor',
      price: 42500,
      compareAt: 48000,
      images: ['/images/products/formal-aab.jpg', '/images/products/dupatta-rose.jpg'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ name: 'Rose Sand', hex: '#d5b3ad' }, { name: 'Rose Ink', hex: '#a95f62' }],
      fabric: 'Raw silk with printed dupatta',
      pieces: '2 Piece',
      description:
        'A soft rose silk kurta printed with painterly blooms, paired with a hand-finished dupatta. Understated drama for a daytime mehndi.',
      details: ['Digital print on raw silk', 'Hand-finished dupatta with tilla border', 'Side slits with concealed pockets', 'Includes silk trousers'],
      care: ['Dry clean recommended', 'Cool iron on reverse'],
      stock: 14,
      isNew: true,
      isDrop: false,
      featured: false,
      rating: 4.7,
      reviewCount: 14,
      tags: ['formals', 'silk', 'print'],
      reviews: [],
      createdAt: daysAgo(9)
    },
    {
      id: 'p_laila',
      slug: 'laila-mauve-embroidered',
      name: 'Laila',
      subtitle: 'Mauve embroidered celebration suit',
      category: 'formals',
      collection: 'Mehfil Nights',
      price: 58900,
      compareAt: null,
      images: ['/images/products/formal-laila.jpg', '/images/products/formal-shab.jpg'],
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [{ name: 'Mauve', hex: '#a3818b' }, { name: 'Dusty Rose', hex: '#c19a96' }],
      fabric: 'Organza with inner lining',
      pieces: '3 Piece',
      description:
        'Mauve organza with a soft sheen, embroidered in pastel thread and finished with hand-made pearl buttons. Quietly romantic.',
      details: ['Pastel thread embroidery with pearl buttons', 'Organza shirt with cotton lining', 'Embroidered organza dupatta', 'Includes cigarette pants'],
      care: ['Dry clean only'],
      stock: 9,
      isNew: false,
      isDrop: false,
      featured: false,
      rating: 4.8,
      reviewCount: 12,
      tags: ['formals', 'organza'],
      reviews: [],
      createdAt: daysAgo(41)
    },
    {
      id: 'p_rania',
      slug: 'rania-ink-palm-lawn',
      name: 'Rania',
      subtitle: 'Ink palm embroidered lawn',
      category: 'lawn',
      collection: "Gulmohar Summer '26",
      price: 12900,
      compareAt: 15900,
      images: ['/images/products/lawn-rania.jpg', '/images/products/lawn-motifz.jpg'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ name: 'Cobalt Garden', hex: '#244a7a' }, { name: 'Ivory', hex: '#eee6d8' }],
      fabric: 'Premium 3-piece lawn',
      pieces: '3 Piece',
      description:
        'Deep cobalt lawn printed with an ivory palm garden, with an embroidered front panel and a feather-light dupatta. Our fastest seller three seasons running.',
      details: ['Digital print on premium lawn', 'Embroidered front panel and sleeve borders', '2.5m printed lawn dupatta', 'Includes dyed cambric trousers'],
      care: ['Machine wash cold, gentle cycle', 'Wash dark colours separately', 'Do not bleach'],
      stock: 42,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.9,
      reviewCount: 87,
      tags: ['lawn', 'bestseller', 'summer'],
      reviews: [
        { name: 'Nimra J.', city: 'Lahore', rating: 5, text: 'Stitching was flawless and the dupatta is bigger than expected. Buying another colour.' },
        { name: 'Rida F.', city: 'Multan', rating: 4, text: 'Colour is exactly like the pictures. Slightly sheer, needs a slip.' }
      ],
      createdAt: daysAgo(70)
    },
    {
      id: 'p_aangan',
      slug: 'aangan-blush-lawn',
      name: 'Aangan',
      subtitle: 'Blush block-print lawn',
      category: 'lawn',
      collection: "Gulmohar Summer '26",
      price: 9950,
      compareAt: null,
      images: ['/images/products/lawn-aangan.jpg', '/images/products/lawn-meherbano.jpg'],
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [{ name: 'Blush', hex: '#d9a9a3' }, { name: 'Pistachio', hex: '#b9c0a0' }],
      fabric: 'Cotton lawn',
      pieces: '3 Piece',
      description:
        'A soft blush lawn with a hand-drawn block print, cut into a relaxed straight kurta. Everyday ease that still looks considered.',
      details: ['Digital block print on cotton lawn', 'Straight kurta with side slits', 'Printed chiffon dupatta', 'Includes cotton trousers'],
      care: ['Machine wash cold', 'Line dry in shade'],
      stock: 36,
      isNew: false,
      isDrop: false,
      featured: false,
      rating: 4.7,
      reviewCount: 45,
      tags: ['lawn', 'everyday'],
      reviews: [],
      createdAt: daysAgo(52)
    },
    {
      id: 'p_meherbano',
      slug: 'meherbano-rose-lawn',
      name: 'Meherbano',
      subtitle: 'Rose garden lawn set',
      category: 'lawn',
      collection: "Gulmohar Summer '26",
      price: 11400,
      compareAt: 13500,
      images: ['/images/products/lawn-meherbano.jpg', '/images/products/lawn-aangan.jpg'],
      sizes: ['XS', 'S', 'M', 'L'],
      colors: [{ name: 'Rose Garden', hex: '#c98b93' }],
      fabric: 'Lawn with embroidered organza',
      pieces: '3 Piece',
      description:
        'Hand-painted roses on fine lawn, bordered with embroidered organza. Soft enough for the school run, special enough for lunch.',
      details: ['Hand-painted floral print', 'Embroidered organza borders', 'Printed lawn dupatta', 'Includes cambric trousers'],
      care: ['Machine wash cold', 'Iron on reverse'],
      stock: 27,
      isNew: true,
      isDrop: false,
      featured: false,
      rating: 4.8,
      reviewCount: 21,
      tags: ['lawn', 'floral'],
      reviews: [],
      createdAt: daysAgo(11)
    },
    {
      id: 'p_sana',
      slug: 'sana-grey-embroidered-kurta',
      name: 'Sana',
      subtitle: 'Grey chikankari-style kurta',
      category: 'pret',
      collection: 'Everyday Atelier',
      price: 16500,
      compareAt: null,
      images: ['/images/products/pret-sana.jpg', '/images/products/pret-elan.jpg'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [{ name: 'Ash Grey', hex: '#8b8b86' }, { name: 'Sand', hex: '#c6b49a' }],
      fabric: 'Cotton net with cotton slip',
      pieces: '2 Piece',
      description:
        'A grey cotton-net kurta covered in fine white thread work, with a matching slip and trouser. Effortless, breathable, endlessly repeatable.',
      details: ['All-over thread embroidery', 'Cotton-net outer with cotton slip', 'Straight kurta silhouette', 'Includes cotton trousers'],
      care: ['Hand wash cold', 'Dry in shade', 'Iron on reverse'],
      stock: 22,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.6,
      reviewCount: 38,
      tags: ['pret', 'cotton', 'everyday'],
      reviews: [],
      createdAt: daysAgo(60)
    },
    {
      id: 'p_maya',
      slug: 'maya-blockprint-kurta',
      name: 'Maya',
      subtitle: 'Hand-block printed kurta',
      category: 'pret',
      collection: 'Everyday Atelier',
      price: 14500,
      compareAt: 17900,
      images: ['/images/products/pret-maya.jpg', '/images/products/pret-noor.jpg'],
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [{ name: 'Rosewood Block', hex: '#8e3b3b' }, { name: 'Walnut', hex: '#6b4a3a' }],
      fabric: 'Handloom cotton',
      pieces: '2 Piece',
      description:
        'Hand-block printed on handloom cotton by artisans in Bhawalpur. Slight irregularities are the point — no two pieces are identical.',
      details: ['Hand-block printed in Bhawalpur', 'Handloom cotton, softened finish', 'Side pockets', 'Includes matching trousers'],
      care: ['Hand wash separately for the first wash', 'Natural dyes may soften over time'],
      stock: 18,
      isNew: true,
      isDrop: false,
      featured: false,
      rating: 4.7,
      reviewCount: 19,
      tags: ['pret', 'handloom', 'artisan'],
      reviews: [],
      createdAt: daysAgo(8)
    },
    {
      id: 'p_elan',
      slug: 'elan-beige-floral-kurta',
      name: 'Elan',
      subtitle: 'Beige floral embroidered kurta',
      category: 'pret',
      collection: 'Everyday Atelier',
      price: 21900,
      compareAt: null,
      images: ['/images/products/pret-elan.jpg', '/images/products/fabric-detail.jpg'],
      sizes: ['XS', 'S', 'M', 'L'],
      colors: [{ name: 'Bare Beige', hex: '#cbbca6' }, { name: 'Oat', hex: '#ded4c2' }],
      fabric: 'Textured cotton-silk',
      pieces: '2 Piece',
      description:
        'Textured cotton-silk with tone-on-tone floral embroidery climbing the front. The easiest way to look dressed in five minutes.',
      details: ['Tone-on-tone floral embroidery', 'Textured cotton-silk weave', 'Side slits and concealed placket', 'Includes wide-leg trousers'],
      care: ['Dry clean recommended', 'Cool iron'],
      stock: 16,
      isNew: true,
      isDrop: false,
      featured: true,
      rating: 4.9,
      reviewCount: 27,
      tags: ['pret', 'neutral', 'office'],
      reviews: [{ name: 'Komal R.', city: 'Lahore', rating: 5, text: 'I wear this to work every second week. Qualities like a much more expensive brand.' }],
      createdAt: daysAgo(7)
    },
    {
      id: 'p_amal',
      slug: 'amal-navy-chikankari',
      name: 'Amal',
      subtitle: 'Navy chikankari kurta set',
      category: 'pret',
      collection: 'Everyday Atelier',
      price: 18900,
      compareAt: 22500,
      images: ['/images/products/pret-amal.jpg', '/images/products/pret-sana.jpg'],
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [{ name: 'Navy', hex: '#1f2b4a' }, { name: 'Black', hex: '#232323' }],
      fabric: 'Cotton with chikankari embroidery',
      pieces: '2 Piece',
      description:
        'Deep navy cotton with white chikankari, a straight cut and a relaxed sleeve. A wardrobe workhorse we restock on repeat.',
      details: ['Hand chikankari embroidery', 'Soft cotton base', 'Straight cut with side slits', 'Includes matching trousers'],
      care: ['Hand wash cold', 'Do not wring'],
      stock: 24,
      isNew: false,
      isDrop: false,
      featured: false,
      rating: 4.7,
      reviewCount: 33,
      tags: ['pret', 'chikankari'],
      reviews: [],
      createdAt: daysAgo(48)
    },
    {
      id: 'p_bagh',
      slug: 'bagh-jacquard-unstitched',
      name: 'Bagh',
      subtitle: 'Embroidered jacquard unstitched',
      category: 'unstitched',
      collection: 'Fabric Library',
      price: 8450,
      compareAt: 9950,
      images: ['/images/products/unstitched-bagh.jpg', '/images/products/fabric-detail.jpg'],
      sizes: ['Unstitched'],
      colors: [{ name: 'Chalk', hex: '#e6e0d4' }, { name: 'Sand', hex: '#cbbfa9' }],
      fabric: 'Jacquard with embroidered fronts',
      pieces: '3 Piece Unstitched',
      description:
        'A chalk-white jacquard woven with a subtle sheen, paired with an embroidered front and dupatta. Fabric only — for the tailor you trust.',
      details: ['3.5m embroidered jacquard shirt', '2.5m printed dupatta', '2.5m trouser fabric', 'Embroidered neckline patch included'],
      care: ['Hand wash cold', 'Wash before stitching'],
      stock: 40,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.6,
      reviewCount: 52,
      tags: ['unstitched', 'jacquard'],
      reviews: [],
      createdAt: daysAgo(66)
    },
    {
      id: 'p_nazm',
      slug: 'nazm-black-jacquard-unstitched',
      name: 'Nazm',
      subtitle: 'Black embroidered jacquard unstitched',
      category: 'unstitched',
      collection: 'Fabric Library',
      price: 8950,
      compareAt: null,
      images: ['/images/products/unstitched-nazm.jpg', '/images/products/unstitched-siyah.jpg'],
      sizes: ['Unstitched'],
      colors: [{ name: 'Ink Black', hex: '#1b1b1b' }],
      fabric: 'Embroidered jacquard',
      pieces: '3 Piece Unstitched',
      description:
        'Ink-black jacquard with a fine tonal embroidery, dramatic when made into a long shirt. A quiet statement for winter evenings.',
      details: ['3.5m embroidered jacquard shirt', '2.5m chiffon dupatta', '2.5m trouser fabric', 'Embroidered sleeve borders'],
      care: ['Dry clean recommended', 'Wash dark colours separately'],
      stock: 31,
      isNew: true,
      isDrop: false,
      featured: false,
      rating: 4.5,
      reviewCount: 16,
      tags: ['unstitched', 'black'],
      reviews: [],
      createdAt: daysAgo(14)
    },
    {
      id: 'p_siyah',
      slug: 'siyah-embroidered-suit',
      name: 'Siyah',
      subtitle: 'Charcoal embroidered suit',
      category: 'unstitched',
      collection: 'Fabric Library',
      price: 7450,
      compareAt: 8600,
      images: ['/images/products/unstitched-siyah.jpg', '/images/products/unstitched-nazm.jpg'],
      sizes: ['Unstitched'],
      colors: [{ name: 'Charcoal', hex: '#3a3a3a' }],
      fabric: 'Woven jacquard',
      pieces: '2 Piece Unstitched',
      description:
        'Charcoal jacquard with an all-over woven motif, sold as a two-piece for an easy tailored kurta. Our most affordable way into the season.',
      details: ['3m jacquard shirt', '2.5m trouser fabric', 'Woven (not printed) motif'],
      care: ['Hand wash cold'],
      stock: 45,
      isNew: false,
      isDrop: false,
      featured: false,
      rating: 4.4,
      reviewCount: 12,
      tags: ['unstitched', 'value'],
      reviews: [],
      createdAt: daysAgo(90)
    },
    {
      id: 'p_zumarud',
      slug: 'zumarud-emerald-dupatta',
      name: 'Zumarud',
      subtitle: 'Emerald hand-embroidered dupatta',
      category: 'accessories',
      collection: 'The Finishing Note',
      price: 19500,
      compareAt: null,
      images: ['/images/products/dupatta-emerald.jpg', '/images/products/dupatta-navy.jpg'],
      sizes: ['One Size'],
      colors: [{ name: 'Emerald', hex: '#145c48' }],
      fabric: 'Organza with zardozi work',
      pieces: '1 Piece',
      description:
        'Two and a half metres of emerald organza, bordered in antique zardozi and finished with a hand-rolled edge. Instant heirloom.',
      details: ['Hand-embroidered zardozi border', 'Pure organza base', 'Hand-rolled edges', '2.5m x 1m'],
      care: ['Dry clean only', 'Store rolled, not folded'],
      stock: 6,
      isNew: true,
      isDrop: true,
      featured: true,
      rating: 5,
      reviewCount: 15,
      tags: ['accessories', 'dupatta', 'zardozi'],
      reviews: [],
      createdAt: daysAgo(4)
    },
    {
      id: 'p_nayaab',
      slug: 'nayaab-gold-jhumka',
      name: 'Nayaab',
      subtitle: 'Gold-plated jhumki with pearl drop',
      category: 'accessories',
      collection: 'The Finishing Note',
      price: 8400,
      compareAt: null,
      images: ['/images/products/jewellery-jhumka-gold.jpg', '/images/products/jewellery-jhumka-pearl.jpg'],
      sizes: ['One Size'],
      colors: [{ name: 'Antique Gold', hex: '#bd9a5f' }],
      fabric: 'Gold-plated brass with fresh-water pearls',
      pieces: 'Pair',
      description:
        'A traditional jhumka silhouette in antique gold plate, hung with fresh-water pearls. Light enough for a full evening of dancing.',
      details: ['Gold-plated brass base', 'Fresh-water pearl drops', 'Nickel-free posts', 'Weight: 18g per piece'],
      care: ['Keep away from water and perfume', 'Store in the pouch provided'],
      stock: 12,
      isNew: false,
      isDrop: false,
      featured: true,
      rating: 4.8,
      reviewCount: 26,
      tags: ['accessories', 'jewellery'],
      reviews: [],
      createdAt: daysAgo(29)
    },
    {
      id: 'p_meena',
      slug: 'meena-pearl-jhumka',
      name: 'Meena',
      subtitle: 'Pearl-drop jhumka',
      category: 'accessories',
      collection: 'The Finishing Note',
      price: 6400,
      compareAt: 7900,
      images: ['/images/products/jewellery-jhumka-pearl.jpg', '/images/products/jewellery-jhumka-classic.jpg'],
      sizes: ['One Size'],
      colors: [{ name: 'Pearl Gold', hex: '#d4c09a' }],
      fabric: 'Gold-plated brass with pearl beading',
      pieces: 'Pair',
      description:
        'The simpler sister: a compact jhumka in warm gold with a pearl fringe. Pairs with everything from lawn to formal.',
      details: ['Gold-plated brass base', 'Hand-strung pearl fringe', 'Nickel-free posts', 'Weight: 12g per piece'],
      care: ['Keep away from water and perfume', 'Wipe with a soft cloth'],
      stock: 20,
      isNew: false,
      isDrop: false,
      featured: false,
      rating: 4.6,
      reviewCount: 18,
      tags: ['accessories', 'jewellery'],
      reviews: [],
      createdAt: daysAgo(45)
    },
    {
      id: 'p_kundan',
      slug: 'kundan-choker-set',
      name: 'Kundan',
      subtitle: 'Kundan choker & jhumka set',
      category: 'accessories',
      collection: 'The Finishing Note',
      price: 24900,
      compareAt: 28500,
      images: ['/images/products/jewellery-kundan.jpg', '/images/products/jewellery-jhumka-classic.jpg'],
      sizes: ['One Size'],
      colors: [{ name: 'Kundan Gold', hex: '#c0a068' }],
      fabric: 'Kundan, polki and pearl',
      pieces: 'Set',
      description:
        'A kundan choker with matching jhumkas, set in gold plate and finished with pearl fringe. The bridal jewellery you will pass on.',
      details: ['Kundan and polki stones', 'Adjustable cotton dori closure', 'Matching jhumkas included', 'Gift-boxed'],
      care: ['Store flat in the box provided', 'Avoid moisture and perfume'],
      stock: 5,
      isNew: true,
      isDrop: true,
      featured: true,
      rating: 5,
      reviewCount: 8,
      tags: ['accessories', 'bridal', 'kundan'],
      reviews: [],
      createdAt: daysAgo(1)
    }
  ];

  const promoCodeSeeds = [
    { code: 'WELCOME10', type: 'percent', value: 10, minOrder: 0, maxUses: 0, used: 0, active: true, expiresAt: null, description: '10% off your first order' },
    { code: 'ZARGUL25', type: 'percent', value: 25, minOrder: 15000, maxUses: 200, used: 34, active: true, expiresAt: new Date(Date.now() + 20 * DAY).toISOString(), description: 'Festive drop — 25% off orders above PKR 15,000' },
    { code: 'FLAT5000', type: 'fixed', value: 5000, minOrder: 50000, maxUses: 100, used: 12, active: true, expiresAt: new Date(Date.now() + 45 * DAY).toISOString(), description: 'PKR 5,000 off orders above PKR 50,000' },
    { code: 'FREESHIP', type: 'shipping', value: 0, minOrder: 5000, maxUses: 0, used: 88, active: true, expiresAt: null, description: 'Free delivery on orders above PKR 5,000' }
  ];

  const settings = {
    storeName: 'Ismail Elegance',
    tagline: 'Quiet luxury, made in Pakistan',
    announcement: 'Free delivery on orders above PKR 10,000  ·  Use code WELCOME10 for 10% off your first order',
    announcementActive: true,
    phone: '+92 300 842 7710',
    whatsapp: '923008427710',
    email: 'hello@ismailelegance.pk',
    address: '24-C, MM Alam Road, Gulberg III, Lahore 54660, Pakistan',
    hours: 'Monday – Saturday · 11:00 AM – 9:00 PM',
    instagram: 'https://instagram.com/ismailelegance',
    facebook: 'https://facebook.com/ismailelegance',
    tiktok: 'https://tiktok.com/@ismailelegance',
    youtube: '',
    pinterest: 'https://pinterest.com/ismailelegance',
    currency: 'PKR',
    freeShippingThreshold: 10000,
    shippingFee: 350,
    returnWindow: 14,
    dropTitle: "Zar Gul · Festive '26",
    dropSubtitle: 'The festive drop closes in',
    dropEndsAt: new Date(Date.now() + 9 * DAY + 5 * 60 * 60 * 1000).toISOString(),
    dropNote: 'Hand-embellished bridal, formals and the emerald dupatta everyone is asking about.',
    heroSlides: [
      {
        image: '/images/products/bridal-meher.jpg',
        kicker: "Festive '26 · The Zar Gul Edit",
        title: 'Heirlooms,\nre-imagined',
        subtitle: 'Hand-embellished zardozi, gold tissue and pearl work — made for the season of celebration.',
        ctaLabel: 'Shop the drop',
        ctaHref: '/shop?drop=1',
        tone: 'dark'
      },
      {
        image: '/images/products/lawn-rania.jpg',
        kicker: 'Gulmohar · Lawn & Summer',
        title: 'Sunlit lawns,\nquiet luxury',
        subtitle: 'Airy prints, fine embroidery and dupattas that actually cover — for everyday ease.',
        ctaLabel: 'Explore lawn',
        ctaHref: '/shop?category=lawn',
        tone: 'dark'
      },
      {
        image: '/images/products/formal-aab.jpg',
        kicker: 'Bagh-e-Noor · Luxe Pret',
        title: 'The art\nof ease',
        subtitle: 'Silk, chiffon and organza — cut for movement, finished by hand.',
        ctaLabel: 'Shop luxe pret',
        ctaHref: '/shop?category=pret',
        tone: 'dark'
      }
    ],
    instagramPosts: [
      '/images/products/bridal-sahar.jpg',
      '/images/products/lawn-rania.jpg',
      '/images/products/pret-elan.jpg',
      '/images/products/dupatta-emerald.jpg',
      '/images/products/formal-shab.jpg',
      '/images/products/pret-amal.jpg',
      '/images/products/bridal-zohra.jpg',
      '/images/products/lawn-meherbano.jpg'
    ],
    aboutHeading: 'A Lahore atelier, built on cloth and conversation',
    aboutText:
      'Ismail Elegance began in 2019 as a single counter on MM Alam Road, selling hand-embroidered fabric to women who knew exactly what they wanted. Seven years on, we still work the same way: small runs, real hands, and a deep respect for the cloth.\n\nEvery collection begins with a fabric — a jacquard from Faisalabad, an organza that catches light a certain way — and ends with a woman in Lahore, Karachi or Dubai wearing something that feels like hers.',
    aboutImage: '/images/boutique/atelier.jpg',
    values: [
      { title: 'Made by hand', text: 'Zardozi, tilla and chikankari worked by artisans we have known for years.' },
      { title: 'Small runs', text: 'We produce in limited quantities so nothing feels everywhere.' },
      { title: 'Fits real life', text: 'Free alterations on stitched pieces, and honest sizing advice on WhatsApp.' }
    ],
    socialLinksUpdatedAt: new Date().toISOString(),
    adminEmail: (process.env.ADMIN_EMAIL || 'admin@ismailelegance.pk').trim().toLowerCase(),
    adminPasswordSalt: salt,
    adminPasswordHash: hash,
    adminPasswordEnvTag: process.env.ADMIN_PASSWORD ? adminPasswordEnvTag(password, { adminPasswordSalt: salt }) : null
  };

  return {
    version: 1,
    settings,
    categories,
    products,
    promoCodes: promoCodeSeeds.map((p, i) => ({ id: 'promo_' + (i + 1), ...p })),
    orders: [],
    messages: [],
    subscribers: [],
    dropAlerts: [],
    visits: 0,
    users: [],
    adminUsers: []
  };
}

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify(buildSeed(), null, 2));
  console.log('Seeded data/db.json');
}

module.exports = { buildSeed, hashPassword, newAdminCredentials, applyAdminEnvCredentials, adminPasswordEnvTag, takeGeneratedPassword };
