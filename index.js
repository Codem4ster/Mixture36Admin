// worker.js - Deploy to Cloudflare Workers

// Configuration: Create a KV namespace named "QUIZ_DATA" in your Cloudflare dashboard
// and bind it to this worker with the variable name "QUIZ_DATA"

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers for cross-origin requests from your quiz site
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API endpoint: receive quiz submission
    if (url.pathname === '/api/quiz-submit' && request.method === 'POST') {
      try {
        const data = await request.json();
        
        // Validate required fields
        if (!data.userName || data.score === undefined) {
          return new Response(JSON.stringify({ 
            error: 'Missing required fields: userName, score' 
          }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders 
            }
          });
        }

        // Create submission record
        const submission = {
          id: crypto.randomUUID(),
          userName: data.userName,
          score: data.score,
          totalQuestions: data.totalQuestions || 10,
          startTime: data.startTime,
          submitTime: data.submitTime,
          answers: data.answers || [],
          receivedAt: new Date().toISOString(),
          ip: request.headers.get('cf-connecting-ip') || 'unknown'
        };

        // Store in KV - key structure: submissions:timestamp:uuid for ordering
        const key = `submission:${Date.now()}:${submission.id}`;
        await env.QUIZ_DATA.put(key, JSON.stringify(submission));

        // Also store in a list for easy retrieval
        const listKey = 'submissions_list';
        let submissionsList = [];
        const existingList = await env.QUIZ_DATA.get(listKey);
        if (existingList) {
          submissionsList = JSON.parse(existingList);
        }
        submissionsList.unshift(key); // Add to beginning (newest first)
        // Keep only last 100 submissions to manage storage
        if (submissionsList.length > 100) {
          submissionsList = submissionsList.slice(0, 100);
        }
        await env.QUIZ_DATA.put(listKey, JSON.stringify(submissionsList));

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Submission received',
          id: submission.id 
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: 'Invalid JSON or server error',
          details: error.message 
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
    }

    // API endpoint: get all submissions (for dashboard)
    if (url.pathname === '/api/submissions' && request.method === 'GET') {
      try {
        const listKey = 'submissions_list';
        const submissionsList = JSON.parse(await env.QUIZ_DATA.get(listKey) || '[]');
        
        // Retrieve each submission
        const submissions = [];
        for (const key of submissionsList) {
          const data = await env.QUIZ_DATA.get(key);
          if (data) {
            submissions.push(JSON.parse(data));
          }
        }

        return new Response(JSON.stringify(submissions), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }
    }

    // API endpoint: clear all submissions (with simple auth)
    if (url.pathname === '/api/clear' && request.method === 'POST') {
      const authHeader = request.headers.get('X-Clear-Key') || '';
      const clearKey = env.CLEAR_KEY || 'admin123'; // Set this in environment variables
      
      if (authHeader !== clearKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          }
        });
      }

      const listKey = 'submissions_list';
      const submissionsList = JSON.parse(await env.QUIZ_DATA.get(listKey) || '[]');
      
      // Delete all submission entries
      for (const key of submissionsList) {
        await env.QUIZ_DATA.delete(key);
      }
      await env.QUIZ_DATA.put(listKey, '[]');

      return new Response(JSON.stringify({ success: true, message: 'All submissions cleared' }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        }
      });
    }

    // Serve the HTML dashboard
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      return new Response(getDashboardHTML(), {
        status: 200,
        headers: { 
          'Content-Type': 'text/html;charset=UTF-8',
          ...corsHeaders 
        }
      });
    }

    // 404 for other routes
    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders 
    });
  }
};

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
  <title>Quiz Submissions Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
      padding: 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    h1 {
      font-size: 1.8rem;
      font-weight: 700;
      color: #f8fafc;
    }
    
    .stats {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .stat-item {
      background: rgba(59,130,246,0.15);
      padding: 10px 16px;
      border-radius: 12px;
      text-align: center;
      min-width: 80px;
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #60a5fa;
    }
    
    .stat-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    
    button:hover {
      background: #2563eb;
    }
    
    button.danger {
      background: #dc2626;
    }
    
    button.danger:hover {
      background: #b91c1c;
    }
    
    button.secondary {
      background: #475569;
    }
    
    button.secondary:hover {
      background: #334155;
    }
    
    .submission-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 12px;
      transition: background 0.2s;
    }
    
    .submission-card:hover {
      background: rgba(255,255,255,0.08);
    }
    
    .submission-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }
    
    .user-name {
      font-weight: 700;
      font-size: 1.1rem;
      color: #f1f5f9;
    }
    
    .score-badge {
      background: #22c55e;
      color: #052e16;
      padding: 4px 12px;
      border-radius: 20px;
      font-weight: 700;
      font-size: 0.9rem;
    }
    
    .score-badge.low {
      background: #f59e0b;
      color: #451a03;
    }
    
    .score-badge.fail {
      background: #ef4444;
      color: #450a0a;
    }
    
    .timestamps {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    
    .answers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 6px;
      font-size: 0.75rem;
    }
    
    .answer-item {
      background: rgba(255,255,255,0.03);
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    
    .answer-item.correct {
      border-color: #22c55e;
      color: #86efac;
    }
    
    .answer-item.wrong {
      border-color: #ef4444;
      color: #fca5a5;
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #64748b;
    }
    
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }
    
    @media (max-width: 600px) {
      header {
        flex-direction: column;
        align-items: flex-start;
      }
      .stats {
        width: 100%;
        justify-content: space-between;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 Quiz Submissions</h1>
      <div class="stats">
        <div class="stat-item">
          <div class="stat-value" id="totalSubmissions">0</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="avgScore">-</div>
          <div class="stat-label">Avg Score</div>
        </div>
        <div class="stat-item">
          <div class="stat-value" id="latestUser">-</div>
          <div class="stat-label">Latest</div>
        </div>
      </div>
    </header>
    
    <div class="controls">
      <button onclick="fetchSubmissions()">🔄 Refresh</button>
      <button class="secondary" onclick="toggleAutoRefresh()" id="autoRefreshBtn">
        ⏱ Auto-Refresh: OFF
      </button>
      <button class="danger" onclick="clearSubmissions()">🗑 Clear All</button>
    </div>
    
    <div id="submissionsContainer">
      <div class="loading">Loading submissions...</div>
    </div>
  </div>
  
  <script>
    let autoRefreshInterval = null;
    let autoRefreshEnabled = false;
    
    function formatDate(dateStr) {
      if (!dateStr) return 'N/A';
      return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    
    function getScoreClass(score, total) {
      const percentage = (score / total) * 100;
      if (percentage >= 70) return '';
      if (percentage >= 40) return 'low';
      return 'fail';
    }
    
    async function fetchSubmissions() {
      const container = document.getElementById('submissionsContainer');
      container.innerHTML = '<div class="loading">Loading submissions...</div>';
      
      try {
        const response = await fetch('/api/submissions');
        const submissions = await response.json();
        
        if (!submissions.length) {
          container.innerHTML = \`
            <div class="empty-state">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p>No submissions yet. Waiting for quiz data...</p>
            </div>
          \`;
          updateStats([]);
          return;
        }
        
        // Update stats
        updateStats(submissions);
        
        // Render submissions
        container.innerHTML = submissions.map((sub, index) => {
          const scoreClass = getScoreClass(sub.score, sub.totalQuestions);
          const percentage = ((sub.score / sub.totalQuestions) * 100).toFixed(0);
          
          let answersHTML = '';
          if (sub.answers && sub.answers.length) {
            answersHTML = \`
              <div class="answers-grid">
                \${sub.answers.map((a, i) => {
                  const isCorrect = a.selected === a.correct;
                  const cls = isCorrect ? 'correct' : 'wrong';
                  return \`<div class="answer-item \${cls}">
                    Q\${i+1}: \${a.selected || '—'} \${isCorrect ? '✓' : '✗'}
                  </div>\`;
                }).join('')}
              </div>
            \`;
          }
          
          return \`
            <div class="submission-card">
              <div class="submission-header">
                <span class="user-name">\${sub.userName}</span>
                <span class="score-badge \${scoreClass}">
                  \${sub.score}/\${sub.totalQuestions} (\${percentage}%)
                </span>
              </div>
              <div class="timestamps">
                <span>🕒 Start: \${formatDate(sub.startTime)}</span>
                <span>✅ Submit: \${formatDate(sub.submitTime)}</span>
                <span>📥 Received: \${formatDate(sub.receivedAt)}</span>
              </div>
              \${answersHTML}
            </div>
          \`;
        }).join('');
        
      } catch (error) {
        container.innerHTML = \`
          <div class="empty-state">
            <p>Error loading submissions: \${error.message}</p>
          </div>
        \`;
        updateStats([]);
      }
    }
    
    function updateStats(submissions) {
      document.getElementById('totalSubmissions').textContent = submissions.length;
      
      if (submissions.length > 0) {
        const totalScore = submissions.reduce((sum, s) => sum + s.score, 0);
        const avg = (totalScore / submissions.length).toFixed(1);
        document.getElementById('avgScore').textContent = avg;
        document.getElementById('latestUser').textContent = submissions[0].userName;
      } else {
        document.getElementById('avgScore').textContent = '-';
        document.getElementById('latestUser').textContent = '-';
      }
    }
    
    function toggleAutoRefresh() {
      const btn = document.getElementById('autoRefreshBtn');
      if (autoRefreshEnabled) {
        clearInterval(autoRefreshInterval);
        autoRefreshEnabled = false;
        btn.textContent = '⏱ Auto-Refresh: OFF';
      } else {
        autoRefreshInterval = setInterval(fetchSubmissions, 5000);
        autoRefreshEnabled = true;
        btn.textContent = '⏱ Auto-Refresh: ON (5s)';
      }
    }
    
    async function clearSubmissions() {
      if (!confirm('Are you sure you want to delete ALL submissions? This cannot be undone.')) {
        return;
      }
      
      const clearKey = prompt('Enter clear key (default: admin123):');
      if (!clearKey) return;
      
      try {
        const response = await fetch('/api/clear', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Clear-Key': clearKey
          }
        });
        
        const result = await response.json();
        if (result.success) {
          fetchSubmissions();
        } else {
          alert('Failed to clear: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
    
    // Initial load
    fetchSubmissions();
  </script>
</body>
</html>`;
}
