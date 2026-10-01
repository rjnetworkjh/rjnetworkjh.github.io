/** Tailwind v3 — শুধু ব্যবহৃত ক্লাসগুলো style.css-এ আসবে */
module.exports = {
  content: [
    './*.html',
    './p/*.html',
    './products.js',
    './cart.js',          // cart.js থাকলে তার ক্লাসও ধরা হবে
    './router-login.html' // আপনার রিপোতে থাকলে ধরা হবে
  ],
  theme: { extend: {} },
  plugins: []
};
