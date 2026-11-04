'use strict';

const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, '..', 'public', 'index.html');
// Optional repo-root file holding the raw Meta Pixel snippet, so the code
// can be managed on GitHub (file named "pixel") instead of an env var.
const PIXEL_FILE = path.join(__dirname, '..', 'pixel');
// Placeholder in public/index.html <head> where the pixel snippet is injected.
const PLACEHOLDER = '<!-- META_PIXEL -->';

let cachedHtml = null;
let cachedPixelFile = null;
let pixelFileLoaded = false;

/**
 * Meta (Facebook) Pixel ID from the environment. Pixel IDs are numeric;
 * anything else is treated as "not configured" so a typo never ships a
 * broken snippet.
 */
function pixelId() {
  const id = (process.env.META_PIXEL_ID || '').trim();
  return /^\d{6,20}$/.test(id) ? id : null;
}

/**
 * Raw pixel snippet from the repo-root "pixel" file, when present. Only
 * used as-is when it actually looks like Meta Pixel code.
 */
function pixelFileSnippet() {
  if (!pixelFileLoaded) {
    pixelFileLoaded = true;
    try {
      cachedPixelFile = fs.readFileSync(PIXEL_FILE, 'utf8');
    } catch (_) {
      cachedPixelFile = null;
    }
  }
  if (!cachedPixelFile) return null;
  const trimmed = cachedPixelFile.trim();
  return trimmed.includes('fbq(') || trimmed.includes('facebook.com/tr') ? trimmed : null;
}

/** Standard Meta base code for one pixel ID (init + PageView + noscript). */
function pixelSnippet(id) {
  return `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->`;
}

/**
 * The snippet to inject: generated from META_PIXEL_ID when that is set,
 * otherwise the raw contents of the repo-root "pixel" file, otherwise none.
 */
function activeSnippet() {
  const id = pixelId();
  if (id) return pixelSnippet(id);
  return pixelFileSnippet();
}

/**
 * public/index.html with the Meta Pixel snippet injected when a pixel is
 * configured (META_PIXEL_ID env var or the repo-root "pixel" file). Files
 * are read once and cached; the env var is re-read on every call so tests
 * and deploys can toggle it without a restart.
 */
function renderIndexHtml() {
  if (!cachedHtml) cachedHtml = fs.readFileSync(INDEX_FILE, 'utf8');
  if (!cachedHtml.includes(PLACEHOLDER)) return cachedHtml;
  const snippet = activeSnippet();
  return cachedHtml.replace(PLACEHOLDER, snippet || '');
}

module.exports = { renderIndexHtml, pixelId, pixelSnippet, activeSnippet };
