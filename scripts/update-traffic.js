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

// Helper: Generate SVG Dashboard (Tactical Data Console)
function generateSVG(totalViews, totalUniques, history) {
  const width = 800;
  const height = 120;
  const margin = 20;

  // 1. Process Data for Chart
  // Extract daily views, sort by date, take last 14 days
  const days = Object.keys(history.daily || {}).sort();
  const recentDays = days.slice(-14); 
  const dataPoints = recentDays.map(date => history.daily[date].views);
  
  // If no data, provide dummy flat line
  const chartData = dataPoints.length > 0 ? dataPoints : [0,0,0,0,0];
  
  // Normalize for Y-axis (height: 60px inside the chart area)
  const maxVal = Math.max(...chartData, 10); // avoid div by zero
  const chartHeight = 50;
  const chartYBase = 90;
  const chartXStart = 450;
  const chartWidth = 300;
  const stepX = chartWidth / (chartData.length - 1 || 1);

  let polylinePoints = "";
  chartData.forEach((val, idx) => {
    const x = chartXStart + (idx * stepX);
    const y = chartYBase - ((val / maxVal) * chartHeight);
    polylinePoints += `${x},${y} `;
  });

  // Formatting
  const format = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .t-glow { text-shadow: 0 0 5px #00f3ff; }
    .p-glow { filter: drop-shadow(0 0 4px #bd00ff); }
    .bg-anim { animation: pulse 4s infinite alternate; }
    @keyframes pulse { 0% { opacity: 0.1; } 100% { opacity: 0.3; } }
    @keyframes spin { 0% { transform: rotate(0deg); transform-origin: 400px 60px; } 100% { transform: rotate(360deg); transform-origin: 400px 60px; } }
    @keyframes dash { to { stroke-dashoffset: 0; } }
  </style>

  <!-- Base Background -->
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  
  <!-- Cyber Grid Background -->
  <path d="M0 20 H${width} M0 40 H${width} M0 60 H${width} M0 80 H${width} M0 100 H${width}" stroke="#30363d" stroke-width="0.5" stroke-opacity="0.3"/>
  <path d="M200 0 V${height} M400 0 V${height} M600 0 V${height}" stroke="#30363d" stroke-width="0.5" stroke-opacity="0.3"/>

  <!-- Center Core (Reactor) -->
  <circle cx="400" cy="60" r="40" stroke="#30363d" stroke-width="1" fill="#0d1117"/>
  <circle cx="400" cy="60" r="35" stroke="#00f3ff" stroke-width="2" stroke-dasharray="10 10" style="animation: spin 10s linear infinite; opacity: 0.3"/>
  <circle cx="400" cy="60" r="25" fill="#00f3ff" fill-opacity="0.1" class="bg-anim"/>
  <text x="400" y="64" text-anchor="middle" font-family="monospace" font-size="10" fill="#00f3ff" letter-spacing="2">CORE</text>

  <!-- Left Module: Stats Big Display -->
  <g transform="translate(40, 0)">
     <rect x="0" y="20" width="3" height="80" fill="#00f3ff" class="p-glow"/>
     <text x="20" y="45" font-family="Arial, sans-serif" font-size="10" fill="#8b949e" letter-spacing="1">TOTAL TRAFFIC</text>
     <text x="20" y="80" font-family="Arial, sans-serif" font-weight="bold" font-size="36" fill="#ffffff" class="t-glow">${format(totalViews)}</text>
     <text x="140" y="80" font-family="monospace" font-size="12" fill="#00f3ff">VIEWs</text>
  </g>

  <!-- Right Module: Live Chart -->
  <g>
    <text x="450" y="35" font-family="monospace" font-size="10" fill="#8b949e">ACTIVITY_WAVEFORM (14 DAYS)</text>
    <!-- Chart Axis -->
    <line x1="${chartXStart}" y1="${chartYBase}" x2="${chartXStart + chartWidth}" y2="${chartYBase}" stroke="#30363d" stroke-width="1"/>
    
    <!-- The Graph Line -->
    <polyline points="${polylinePoints}" fill="none" stroke="#bd00ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="p-glow">
        <animate attributeName="stroke-dasharray" from="0, 1000" to="1000, 0" dur="2s" fill="freeze" />
    </polyline>
    
    <!-- Area under curve (optional opacity) -->
    <polyline points="${chartXStart},${chartYBase} ${polylinePoints} ${chartXStart + chartWidth},${chartYBase}" fill="url(#gradChart)" opacity="0.2"/>
  </g>

  <!-- Gradients -->
  <defs>
    <linearGradient id="gradChart" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bd00ff"/>
      <stop offset="100%" stop-color="#bd00ff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Decorative Corners -->
  <path d="M10 10 L30 10 L10 30 Z" fill="#00f3ff" opacity="0.5"/>
  <path d="M${width-10} ${height-10} L${width-30} ${height-10} L${width-10} ${height-30} Z" fill="#bd00ff" opacity="0.5"/>

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
    const svgContent = generateSVG(totalViews, totalUniques, history);
    fs.writeFileSync(CONFIG.svgFile, svgContent);
    console.log(`SVG badge generated at ${CONFIG.svgFile}`);

  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
