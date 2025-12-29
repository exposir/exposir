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

// Helper: Generate SVG Badge (Cyberpunk AI HUD Style)
function generateSVG(totalViews, totalUniques) {
  const width = 320;
  const height = 60;
  
  const format = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;
  const viewsText = format(totalViews);
  const uniquesText = format(totalUniques);

  // Randomize a "CPU Load" number for extra sci-fi feel
  const cpuLoad = Math.floor(Math.random() * 30) + 40; 

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    @keyframes scan {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes pulse {
      0% { opacity: 0.4; }
      50% { opacity: 1; }
      100% { opacity: 0.4; }
    }
    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.2; }
    }
    .text-glow {
      text-shadow: 0 0 2px #00f3ff, 0 0 5px #00f3ff;
    }
    .border-glow {
      filter: drop-shadow(0 0 2px #00f3ff);
    }
  </style>

  <!-- Background Base -->
  <rect x="2" y="2" width="${width-4}" height="${height-4}" fill="#050a10" stroke="none" />
  
  <!-- Holographic Grid Pattern -->
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#00f3ff" stroke-width="0.5" stroke-opacity="0.1"/>
    </pattern>
    <linearGradient id="scan-gradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#00f3ff" stop-opacity="0" />
      <stop offset="50%" stop-color="#00f3ff" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#00f3ff" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="${width-4}" height="${height-4}" fill="url(#grid)" />

  <!-- Scanning Line Animation -->
  <rect x="2" y="2" width="${width-4}" height="${height-4}" fill="url(#scan-gradient)" style="animation: scan 3s linear infinite; mask: url(#mask-layer);" />

  <!-- Main HUD Border -->
  <path d="M 10 2 L ${width-10} 2 L ${width-2} 10 L ${width-2} ${height-10} L ${width-10} ${height-2} L 10 ${height-2} L 2 ${height-10} L 2 10 Z" stroke="#00f3ff" stroke-width="1" fill="none" class="border-glow" stroke-opacity="0.6"/>
  
  <!-- Decor elements -->
  <rect x="0" y="20" width="2" height="20" fill="#00f3ff" class="border-glow"/>
  <rect x="${width-2}" y="20" width="2" height="20" fill="#00f3ff" class="border-glow"/>
  <rect x="20" y="${height-5}" width="60" height="2" fill="#00f3ff" fill-opacity="0.5"/>

  <!-- AI Core Status -->
  <circle cx="25" cy="30" r="3" fill="#00f3ff" style="animation: pulse 2s infinite"/>
  <circle cx="25" cy="30" r="6" stroke="#00f3ff" stroke-width="1" stroke-opacity="0.5"/>
  <text x="38" y="33" font-family="Consolas, Monaco, monospace" font-size="10" fill="#00f3ff" fill-opacity="0.7">SYSTEM.ACTIVE</text>

  <!-- Data Readout -->
  <g font-family="Consolas, Monaco, monospace" font-weight="bold">
    <!-- Label -->
    <text x="${width - 130}" y="20" font-size="9" fill="#00f3ff" fill-opacity="0.5" text-anchor="end">TRAFFIC_LOG</text>
    
    <!-- Views Number -->
    <text x="${width - 25}" y="30" font-size="20" fill="#fff" text-anchor="end" class="text-glow">${viewsText}</text>
    <text x="${width - 25}" y="45" font-size="10" fill="#00f3ff" fill-opacity="0.8" text-anchor="end">UNIQUES: ${uniquesText}</text>
  </g>
  
  <!-- Tiny decorative random hex -->
  <text x="140" y="52" font-family="Consolas, monospace" font-size="8" fill="#00f3ff" fill-opacity="0.3">0x${Math.floor(Math.random()*16777215).toString(16).toUpperCase()}</text>
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
