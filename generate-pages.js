/**
 * products.js থেকে প্রতিটি পণ্যের জন্য আলাদা স্ট্যাটিক পেজ (p/<id>.html) এবং sitemap.xml বানায়।
 * কেন? Facebook/WhatsApp/Google-এর ক্রলার JavaScript চালায় না — স্ট্যাটিক পেজে পণ্যের নাম, ছবি,
 * দাম আগে থেকেই HTML-এ থাকে, তাই শেয়ার প্রিভিউ ও SEO ভালো হয়।
 *
 * চালান:  node generate-pages.js     (products.js বদলালে প্রতিবার)
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://rjnetworkjh.github.io/';
const root = __dirname;

const PRODUCTS = new Function(fs.readFileSync(path.join(root, 'products.js'), 'utf8') + '\nreturn PRODUCTS;')();
const tpl = fs.readFileSync(path.join(root, 'product.html'), 'utf8');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const taka = n => '৳ ' + Number(n).toLocaleString('en-BD');
const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

for (const marker of ['<!--SEO_HEAD-->', '<!--STATIC_INIT-->', '<!--NOSCRIPT-->']) {
  if (!tpl.includes(marker)) throw new Error('product.html-এ ' + marker + ' পাওয়া যায়নি');
}

fs.mkdirSync(path.join(root, 'p'), { recursive: true });
// পুরোনো/মুছে ফেলা পণ্যের পেজ সরান
const keep = new Set(PRODUCTS.map(p => p.id + '.html'));
for (const f of fs.readdirSync(path.join(root, 'p'))) if (f.endsWith('.html') && !keep.has(f)) fs.unlinkSync(path.join(root, 'p', f));

for (const p of PRODUCTS) {
  const url = SITE + 'p/' + encodeURIComponent(p.id) + '.html';
  const title = `${p.name} — দাম ${taka(p.price)} | RJ NETWORK কুষ্টিয়া`;
  const desc = `${p.description || p.name} দাম ${taka(p.price)}। ক্যাশ অন ডেলিভারি। RJ NETWORK, ঝাউদিয়া, কুষ্টিয়া।`;
  const image = SITE + (p.images && p.images[0] ? p.images[0] : 'logo.png');

  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description || p.name,
    sku: p.id, category: p.categoryName, image: (p.images || []).map(i => SITE + i),
    offers: {
      '@type': 'Offer', url, priceCurrency: 'BDT', price: String(p.price),
      availability: p.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'RJ NETWORK' }
    }
  };

  const head = [
    '<base href="/">',
    `<link rel="canonical" href="${url}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    '<meta property="og:type" content="product">',
    '<meta property="og:locale" content="bn_BD">',
    '<meta property="og:site_name" content="RJ NETWORK">',
    `<meta property="og:title" content="${esc(p.name)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json" id="ld-product">${jsonLd(ld)}</script>`
  ].join('\n  ');

  const noscript = `<noscript><section class="glass rounded-3xl p-6 mb-8">
      <h1 class="text-2xl font-black">${esc(p.name)}</h1>
      <p class="mt-3 text-slate-300">${esc(p.description || '')}</p>
      <p class="mt-3 text-2xl font-black text-cyan-300">${esc(taka(p.price))}</p>
      <ul class="mt-3 text-slate-300 list-disc pl-5">${(p.specs || []).map(s => '<li>' + esc(s) + '</li>').join('')}</ul>
      <p class="mt-4">অর্ডার করতে কল করুন: <a href="tel:09639019016" class="text-cyan-300 font-bold">09639-019016</a></p>
    </section></noscript>`;

  let html = tpl
    .replace('<!--SEO_HEAD-->', head)
    .replace('<title>Product Details — RJ NETWORK</title>', `<title>${esc(title)}</title>`)
    .replace('<meta name="description" content="RJ NETWORK Store — Product Details">', `<meta name="description" content="${esc(desc)}">`)
    .replace('<!--STATIC_INIT-->', `<script>window.__PRODUCT_ID__=${JSON.stringify(p.id)};</script>`)
    .replace('<!--NOSCRIPT-->', noscript);

  fs.writeFileSync(path.join(root, 'p', p.id + '.html'), html);
}

// ---- sitemap.xml ----
const today = new Date().toISOString().slice(0, 10);
const urls = [
  ['', '1.0'], ['store.html', '0.9'], ['router-login.html', '0.5'],
  ...PRODUCTS.map(p => ['p/' + encodeURIComponent(p.id) + '.html', '0.7'])
];
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(([u, pr]) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><priority>${pr}</priority></url>`).join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

console.log(`✔ ${PRODUCTS.length}টি পণ্যের পেজ (p/) এবং sitemap.xml তৈরি হয়েছে।`);
