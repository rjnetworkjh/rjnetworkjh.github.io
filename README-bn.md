# RJ NETWORK — আপডেট গাইড

## ১. আপলোড (সবচেয়ে সহজ উপায় — কোনো টুল লাগবে না)
এই ফোল্ডারের সব ফাইল আপনার GitHub রিপোর **রুট ফোল্ডারে** আপলোড করুন (পুরোনো ফাইল রিপ্লেস হবে):
`index.html, store.html, product.html, products.js, style.css, manifest.json, robots.txt, sitemap.xml, 404.html` এবং `p/` ফোল্ডার।
আপনার আগের `cart.js, logo.png, Rabbi.png, router-login.html, products/` ছবির ফোল্ডার — এগুলো যেমন আছে তেমনই থাকবে।

> ⚠️ `cart.js` আমি দেখিনি। আপলোডের পর কার্ট খুলে দেখুন সব ঠিক আছে কিনা। কার্টের স্টাইল ভেঙে গেলে
> `store.html`, `product.html`, `index.html`-এর `<link rel="stylesheet" href="style.css">` লাইনের নিচে
> সাময়িকভাবে `<script src="https://cdn.tailwindcss.com"></script>` বসিয়ে দিন, তারপর নিচের "রিবিল্ড" ধাপ করুন।

## ২. Cloudflare Worker (নিরাপত্তা — জরুরি)
`worker.js`-এর কোড আপনার Worker-এ বসান, তারপর Settings → Variables-এ যোগ করুন:
`ALLOWED_ORIGINS = https://rjnetworkjh.github.io` (BOT_TOKEN ও CHAT_ID আগের মতোই থাকবে)।
Web3Forms ড্যাশবোর্ডেও ডোমেইন সীমিত করে দিন।

## ৩. নিজে এডিট করার জায়গা (ফাইলে `TODO` লেখা আছে)
- `index.html`: "সুবিধা" বক্সের লেখা, "জনপ্রিয়" ট্যাগ (কোন প্যাকেজে থাকবে), লাইভ টিভি কার্ড (`display:none` মুছলে দেখাবে)
- `store.html` / `product.html`: ডেলিভারি চার্জ ও ওয়ারেন্টির আসল তথ্য
- `products.js`: `fiber-patch-1`-এর `note` (দামটি কোন দৈর্ঘ্যের তা নিশ্চিত করে লিখুন)

## ৪. নতুন পণ্য যোগ বা products.js বদলালে (SEO পেজ ও sitemap নতুন করতে)
কম্পিউটারে Node.js থাকলে রিপো ফোল্ডারে:
```
npm install        # প্রথমবার
npm run build      # p/ পেজ + sitemap.xml + style.css নতুন করে বানায়
```
Node না থাকলে ফাইল আপলোড করলেই সাইট চলবে; শুধু নতুন পণ্যের আলাদা শেয়ার-পেজ (p/...) হবে না
(শেয়ার বাটন তখন নিজে থেকেই `product.html?id=...` লিংক দেবে)।

## ৫. আপলোডের পর করণীয়
1. Google Search Console-এ সাইট যোগ করে `https://rjnetworkjh.github.io/sitemap.xml` জমা দিন।
2. Google Business Profile-এ "RJ NETWORK" যোগ করুন (ফোন, ঠিকানা, ছবি, ওয়েবসাইট লিংক)।
3. ১২০০×৬৩০ মাপের একটি `og.jpg` বানিয়ে `index.html`-এর `og:image` লাইনে `logo.png`-এর জায়গায় বসান।
4. PageSpeed Insights (pagespeed.web.dev) এ আগে-পরের স্কোর মিলিয়ে দেখুন।
