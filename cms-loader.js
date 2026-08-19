/*
  CMS LOADER — makes client-uploaded photos appear on the site automatically.

  HOW IT WORKS
  ------------
  The admin panel (/admin) saves each category's photo list as ONE file:
    content/gallery.json, content/mens.json, etc.
  Each file looks like:
    { "photos": [ { "image": "/images/mens/mens-1.jpg", "caption": "Men's Kurta" }, ... ] }

  This script fetches that file straight from GitHub each time someone
  visits the page, and builds the photo grid from whatever's listed.
  No rebuild, no redeploy needed — uploads appear within a minute or two.

  SETUP REQUIRED
  ---------------
  Replace GITHUB_REPO below with your actual "username/repo-name" once your
  site is on GitHub. Until then, this script quietly does nothing and the
  page falls back to the photos already baked into the HTML.
*/

const GITHUB_REPO = "NiravJoshi1112/Aarti-Fashion-Palace";
const CACHE_MINUTES = 1;

async function fetchCategory(category) {
  const cacheKey = `cms-cache-${category}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.time < CACHE_MINUTES * 60 * 1000) return parsed.items;
    } catch (e) {}
  }

  const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/content/${category}.json?t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${category}.json`);
  const data = await res.json();
  const items = data.photos || [];

  sessionStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), items }));
  return items;
}

function renderGrid(container, items) {
  if (!items || items.length === 0) return; // keep existing fallback content
  container.innerHTML = '';
  items.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'photo-tile';
    const img = document.createElement('img');
    img.src = resolveImageUrl(item.image);
    img.alt = item.caption || '';
    img.loading = 'lazy';
    tile.appendChild(img);
    container.appendChild(tile);
  });
}

// Photos are served directly from GitHub (not Netlify) so they show up instantly
// regardless of whether a Netlify deploy has run. Old entries stored a relative
// path like "/images/gallery/33517.jpg" — this turns those into a full GitHub URL
// too, so every photo works the same way without needing to edit old data.
function resolveImageUrl(path) {
  if (!path) return path;
  if (path.startsWith('http')) return path; // already a full URL (new uploads)
  const rel = path.startsWith('/') ? path.slice(1) : path;
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${rel}`;
}

async function initCmsGrids() {
  if (GITHUB_REPO.startsWith('REPLACE-WITH')) return; // not configured yet — skip silently

  const grids = document.querySelectorAll('[data-cms-category]');
  for (const grid of grids) {
    const category = grid.getAttribute('data-cms-category');
    try {
      const items = await fetchCategory(category);
      renderGrid(grid, items);
    } catch (err) {
      console.warn(`CMS content for "${category}" unavailable, showing default photos.`, err);
    }
  }
}

document.addEventListener('DOMContentLoaded', initCmsGrids);
