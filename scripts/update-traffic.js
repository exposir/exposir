const fs = require('fs');
const https = require('https');
const path = require('path');

// Configuration
const CONFIG = {
  owner: process.env.GITHUB_REPOSITORY.split('/')[0],
  repo: process.env.GITHUB_REPOSITORY.split('/')[1],
  token: process.env.TRAFFIC_TOKEN, // Requires a PAT with 'repo' scope
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

// Helper: Generate SVG Badge
function generateSVG(totalViews, uniqueVisitors) {
  // Simple flat style badge
  const width = 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20">
    <linearGradient id="b" x2="0" y2="100%">
      <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <mask id="a">
      <rect width="${width}" height="20" rx="3" fill="#fff"/>
    </mask>
    <g mask="url(#a)">
      <rect width="90" height="20" fill="#555"/>
      <rect x="90" width="130" height="20" fill="#007ec6"/>
      <rect width="${width}" height="20" fill="url(#b)"/>
    </g>
    <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
      <text x="46" y="15" fill="#010101" fill-opacity=".3">Traffic</text>
      <text x="46" y="14">Traffic</text>
      <text x="154" y="15" fill="#010101" fill-opacity=".3">${totalViews} views</text>
      <text x="154" y="14">${totalViews} views</text>
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
