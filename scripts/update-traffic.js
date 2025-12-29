const fs = require('fs');
const https = require('https');
const path = require('path');

// Configuration
const CONFIG = {
  owner: process.env.GITHUB_REPOSITORY.split('/')[0],
  repo: process.env.GITHUB_REPOSITORY.split('/')[1],
  token: process.env.TRAFFIC_TOKEN ? process.env.TRAFFIC_TOKEN.trim() : null, // Added .trim()
  dataFile: path.join(__dirname, '../traffic-data.json'),
  svgFile: path.join(__dirname, '../traffic-stat.svg'),
};

if (!CONFIG.token) {
  console.error('Error: TRAFFIC_TOKEN secret is missing. Please add it to Repository Secrets.');
  process.exit(1);
}

// Helper: Make API Request
function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}${endpoint}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Node.js Traffic Counter',
        'Authorization': `token ${CONFIG.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`API Error ${res.statusCode}: ${body}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Helper: Generate SVG Badge (Modern Cosmic Style)
function generateSVG(totalViews, totalUniques) {
  const width = 280;
  const height = 45;
  
  // Format numbers (e.g. 1.2k)
  const format = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;
  
  const viewsText = format(totalViews);
  const uniquesText = format(totalUniques);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Glow Effect -->
  <rect width="${width}" height="${height}" rx="8" fill="#0D1117" stroke="#2c2c2c" stroke-width="1"/>
  <rect x="1" y="1" width="${width-2}" height="${height-2}" rx="7" fill="url(#cosmic_gradient)" />
  
  <!-- Gradient Definition -->
  <defs>
    <linearGradient id="cosmic_gradient" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#161b22"/>
      <stop offset="1" stop-color="#0d1117"/>
    </linearGradient>
    <linearGradient id="text_gradient" x1="0" y1="0" x2="0" y2="100%">
      <stop offset="0" stop-color="#e0e0e0"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
  </defs>

  <!-- Eye Icon -->
  <path d="M22 22.5C22 22.5 27 13 38 13C49 13 54 22.5 54 22.5C54 22.5 49 32 38 32C27 32 22 22.5 22 22.5Z" stroke="#8B949E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M38 26C39.933 26 41.5 24.433 41.5 22.5C41.5 20.567 39.933 19 38 19C36.067 19 34.5 20.567 34.5 22.5C34.5 24.433 36.067 26 38 26Z" stroke="#8B949E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Divider -->
  <line x1="70" y1="10" x2="70" y2="35" stroke="#30363d" stroke-width="1"/>

  <!-- Labels & Numbers -->
  <g font-family="'Segoe UI', Ubuntu, Sans-Serif" font-weight="600">
    <!-- Total Views -->
    <text x="85" y="19" font-size="10" fill="#8b949e">TOTAL VIEWS</text>
    <text x="85" y="34" font-size="16" fill="url(#text_gradient)">${viewsText}</text>
    
    <!-- Uniques -->
    <text x="180" y="19" font-size="10" fill="#8b949e">UNIQUES</text>
    <text x="180" y="34" font-size="16" fill="#58a6ff">${uniquesText}</text>
  </g>
</svg>`;
}

async function main() {
  try {
    console.log(`Fetching traffic data for ${CONFIG.owner}/${CONFIG.repo}...`);
    
    // 1. Load existing data
    let history = { total_views: 0, total_uniques: 0, daily: {} };
    if (fs.existsSync(CONFIG.dataFile)) {
      history = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
    }

    // 2. Fetch latest data from GitHub
    const viewsData = await githubRequest('/traffic/views');
    const clonesData = await githubRequest('/traffic/clones'); // Optional: tracking clones too

    console.log(`Fetched: ${viewsData.count} views in last 14 days.`);

    // 3. Update history (Merge logic)
    // Traffic API returns last 14 days. We need to merge carefully to avoid duplicates.
    // However, for "Total Count", we can't just sum api.count because of sliding window.
    // Best strategy: Store daily records keyed by date.
    
    if (viewsData.views) {
        viewsData.views.forEach(day => {
            const dateStr = day.timestamp.split('T')[0];
            history.daily[dateStr] = {
                views: day.count,
                uniques: day.uniques
            };
        });
    }

    // Recalculate Totals from Daily Map
    let totalViews = 0;
    let totalUniques = 0; // Note: Uniques can't be simply summed, but for approximation we often do, or just track max. 
    // Actually, accurate "Total Unique" is impossible without raw logs. We will sum daily uniques as "Cumulative Daily Uniques".
    
    Object.values(history.daily).forEach(day => {
        totalViews += day.views;
        totalUniques += day.uniques;
    });

    history.total_views = totalViews;
    history.total_uniques = totalUniques;
    history.updated_at = new Date().toISOString();

    // 4. Save updated data
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(history, null, 2));
    console.log(`Updated data saved to ${CONFIG.dataFile}`);

    // 5. Generate SVG
    const svgContent = generateSVG(totalViews, totalUniques);
    fs.writeFileSync(CONFIG.svgFile, svgContent);
    console.log(`SVG badge generated at ${CONFIG.svgFile}`);

  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
