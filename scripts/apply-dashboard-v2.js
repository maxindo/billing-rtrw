#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rel = 'views/dashboard.ejs';
const file = path.join(root, rel);
let src = fs.readFileSync(file, 'utf8');

const cssLink = '  <link rel="stylesheet" href="/css/customer-dashboard-v2.css?v=1.0.0">';
const jsTag = '  <script src="/js/customer-dashboard-v2.js?v=1.0.0" defer></script>';

if (!src.includes('/css/customer-dashboard-v2.css')) {
  if (!src.includes('</head>')) throw new Error('Tidak menemukan </head> di dashboard.ejs');
  src = src.replace('</head>', `${cssLink}\n</head>`);
}

if (!src.includes('/js/customer-dashboard-v2.js')) {
  if (!src.includes('</body>')) throw new Error('Tidak menemukan </body> di dashboard.ejs');
  src = src.replace('</body>', `${jsTag}\n</body>`);
}

if (!src.includes('<body class="customer-dashboard-v2">')) {
  if (!src.includes('<body>')) throw new Error('Tidak menemukan <body> polos di dashboard.ejs');
  src = src.replace('<body>', '<body class="customer-dashboard-v2">');
}

if (!src.includes('class="container mt-4 dashboard-shell"')) {
  const marker = '<div class="container mt-4">';
  if (!src.includes(marker)) throw new Error('Tidak menemukan container utama dashboard');
  src = src.replace(marker, '<div class="container mt-4 dashboard-shell">');
}

fs.writeFileSync(file, src, 'utf8');
console.log('Dashboard V2 applied to views/dashboard.ejs');
console.log('Existing EJS variables, form actions, route URLs, element IDs and business logic were preserved.');
