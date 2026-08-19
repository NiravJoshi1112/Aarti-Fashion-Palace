/*
  CMS LOADER — makes client-uploaded photos appear on the site automatically.

  HOW IT WORKS
  ------------
  The admin panel (/admin) saves each uploaded photo as a small JSON file inside
  content/<category>/ in your GitHub repo, e.g. content/mens/photo-abc123.json:
    { "image": "/images/mens/photo-abc123.jpg", "caption": "Men's Kurta" }

  This script fetches the list of those JSON files straight from GitHub each time
  someone visits the page, and builds the photo grid from whatever it finds.
  No rebuild, no redeploy needed — uploads appear within a minute or two.

  SETUP REQUIRED
  ---------------
  Replace GITHUB_REPO below with your actual "username/repo-name" once your
  site is on GitHub. Until then, this script quietly does nothing and the
  page falls back to the photos already baked into the HTML.
*/

const GITHUB_REPO = "REPLACE-WITH-YOUR-USERNAME/REPLACE-WITH-YOUR-REPO-NAME";
const CACHE_MINUTES = 10;

async function fetchCategory(category) {
  const cacheKey = `cms-cache-${category}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.time < CACHE_MINUTES * 60 * 1000) return parsed.items;
    } catch (e) {}
  }

  const listUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/content/${category}`;
  const res = await fetch(listUrl);
  if (!res.ok) throw new Error(`Could not list ${category}`);
  const files = await res.json();

  const items = await Promise.all(
    files.filter(f => f.name.endsWith('.json')).map(async f => {
      const r = await fetch(f.download_url);
      return r.json();
    })
  );

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
    img.src = item.image;
    img.alt = item.caption || '';
    img.loading = 'lazy';
    tile.appendChild(img);
    container.appendChild(tile);
  });
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
