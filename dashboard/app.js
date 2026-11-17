(function() {
  if (!window.RADAR) return;
  const radar = window.RADAR;

  let currentTab = 'board';
  let searchTerm = '';
  let selectedCategory = '';
  let selectedChain = '';
  let watchlistOnly = false;
  let sortBy = 'rank';
  let activeDetailSlug = null;

  const metaInfo = document.getElementById('metaInfo');
  const statsBar = document.getElementById('statsBar');
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const chainSelect = document.getElementById('chainSelect');
  const watchlistOnlyCheck = document.getElementById('watchlistOnlyCheck');
  const sortSelect = document.getElementById('sortSelect');
  const tableHeaderRow = document.getElementById('tableHeaderRow');
  const tableBody = document.getElementById('tableBody');
  const tabBoardCount = document.getElementById('tabBoardCount');
  const tabLiveCount = document.getElementById('tabLiveCount');
  const detailPanel = document.getElementById('detailPanel');
  const detailTitle = document.getElementById('detailTitle');
  const detailClose = document.getElementById('detailClose');
  const detailContent = document.getElementById('detailContent');

  metaInfo.textContent = `As of: ${radar.as_of} | Source: ${radar.source}`;
  statsBar.innerHTML = `
    <div class="stat-item">Watchlist: ${radar.watchlist_size}</div>
    <div class="stat-item">Board Rows: ${radar.board_size}</div>
    <div class="stat-item">Early Radar: ${radar.early_size}</div>
    <div class="stat-item">Already Trading: ${radar.live_size}</div>
  `;

  tabBoardCount.textContent = radar.rows.length;
  tabLiveCount.textContent = radar.live.length;

  // Populate categories and chains
  const categories = new Set();
  const chains = new Set();
  radar.rows.forEach(r => {
    if (r.category) categories.add(r.category);
    if (r.chains) r.chains.forEach(c => chains.add(c));
  });
  radar.live.forEach(l => {
    if (l.category) categories.add(l.category);
    if (l.chains) l.chains.forEach(c => chains.add(c));
  });

  Array.from(categories).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  Array.from(chains).sort().forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    chainSelect.appendChild(opt);
  });

  function formatUSD(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
  }

  function formatPct(n) {
    if (n === null || n === undefined) return 'N/A';
    const cls = n >= 0 ? 'positive' : 'negative';
    const sign = n > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${n.toFixed(1)}%</span>`;
  }

  function parseHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.has('detail')) {
      activeDetailSlug = params.get('detail');
    }
    if (params.has('search')) {
      searchTerm = params.get('search');
      searchInput.value = searchTerm;
    }
    if (params.has('category')) {
      selectedCategory = params.get('category');
      categorySelect.value = selectedCategory;
    }
    if (params.has('watchlist')) {
      watchlistOnly = params.get('watchlist') === 'true';
      watchlistOnlyCheck.checked = watchlistOnly;
    }
  }

  function updateHash() {
    const params = new URLSearchParams();
    if (activeDetailSlug) params.set('detail', activeDetailSlug);
    if (searchTerm) params.set('search', searchTerm);
    if (selectedCategory) params.set('category', selectedCategory);
    if (watchlistOnly) params.set('watchlist', 'true');
    const str = params.toString();
    window.location.hash = str ? '#' + str : '';
  }

  function renderTable() {
    tableBody.innerHTML = '';
    if (currentTab === 'board') {
      tableHeaderRow.innerHTML = `
        <th>Rank</th>
        <th>Protocol</th>
        <th>Category</th>
        <th>Chains</th>
        <th>TVL</th>
        <th>7d Change</th>
        <th>Age</th>
        <th>Confidence</th>
        <th>Implied Value</th>
      `;

      let filtered = radar.rows.filter(r => {
        if (watchlistOnly && !radar.watchlist_slugs?.includes?.(r.slug)) {
          // if watchlist slugs list not stored, check row name/slug roughly or include all if unknown
        }
        if (selectedCategory && r.category !== selectedCategory) return false;
        if (selectedChain && (!r.chains || !r.chains.includes(selectedChain))) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchName = r.name.toLowerCase().includes(q);
          const matchSlug = r.slug.toLowerCase().includes(q);
          const matchCat = (r.category || '').toLowerCase().includes(q);
          const matchChains = (r.chains || []).some(c => c.toLowerCase().includes(q));
          if (!matchName && !matchSlug && !matchCat && !matchChains) return false;
        }
        return true;
      });

      // Sorting
      filtered.sort((a, b) => {
        if (sortBy === 'rank') return a.rank - b.rank;
        if (sortBy === 'tvl') return b.tvl_usd - a.tvl_usd;
        if (sortBy === 'change') return (b.change_7d ?? -999) - (a.change_7d ?? -999);
        if (sortBy === 'age') return (b.age_days ?? 0) - (a.age_days ?? 0);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return a.rank - b.rank;
      });

      filtered.forEach(r => {
        const tr = document.createElement('tr');
        tr.onclick = () => openDetail(r.slug);
        const tierCls = r.confidence_tier === 'High' ? 'badge-tier-high' : r.confidence_tier === 'Medium' ? 'badge-tier-medium' : 'badge-tier-low';
        tr.innerHTML = `
          <td><strong>#${r.rank}</strong></td>
          <td>
            <strong>${r.name}</strong><br>
            <small style="color:var(--text-muted)">${r.slug}</small>
          </td>
          <td>${r.category || '—'}</td>
          <td>${(r.chains || []).slice(0, 3).join(', ')}</td>
          <td>${formatUSD(r.tvl_usd)}</td>
          <td>${formatPct(r.change_7d)}</td>
          <td>${r.age_days !== null ? r.age_days + 'd' : 'N/A'}</td>
          <td><span class="badge ${tierCls}">${r.confidence_tier}</span></td>
          <td><strong>${formatUSD(r.implied_value_usd)}</strong></td>
        `;
        tableBody.appendChild(tr);
      });

    } else {
      tableHeaderRow.innerHTML = `
        <th>Protocol</th>
        <th>Category</th>
        <th>Chains</th>
        <th>TVL</th>
        <th>Market Cap</th>
        <th>7d Change</th>
      `;

      let filtered = radar.live.filter(l => {
        if (selectedCategory && l.category !== selectedCategory) return false;
        if (selectedChain && (!l.chains || !l.chains.includes(selectedChain))) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchName = l.name.toLowerCase().includes(q);
          const matchSlug = l.slug.toLowerCase().includes(q);
          const matchCat = (l.category || '').toLowerCase().includes(q);
          const matchChains = (l.chains || []).some(c => c.toLowerCase().includes(q));
          if (!matchName && !matchSlug && !matchCat && !matchChains) return false;
        }
        return true;
      });

      filtered.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <strong>${l.name}</strong><br>
            <small style="color:var(--text-muted)">${l.slug}</small>
          </td>
          <td>${l.category || '—'}</td>
          <td>${(l.chains || []).slice(0, 3).join(', ')}</td>
          <td>${formatUSD(l.tvl_usd)}</td>
          <td><strong>${l.mcap_usd !== null ? formatUSD(l.mcap_usd) : 'N/A'}</strong></td>
          <td>${formatPct(l.change_7d)}</td>
        `;
        tableBody.appendChild(tr);
      });
    }

    if (activeDetailSlug && currentTab === 'board') {
      showDetailData(activeDetailSlug);
    }
  }

  function openDetail(slug) {
    activeDetailSlug = slug;
    updateHash();
    showDetailData(slug);
  }

  function showDetailData(slug) {
    const row = radar.rows.find(r => r.slug === slug);
    if (!row) return;

    detailTitle.textContent = `${row.name} (${row.slug}) — Rank #${row.rank}`;
    
    // Generate sample farm steps on the fly if needed or use standard wording
    const capital = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
    const chain = (row.chains || [])[0] || 'its main chain';
    const hold = (row.age_days ?? 365) < 180 ? 60 : (row.age_days ?? 365) < 365 ? 45 : 30;

    detailContent.innerHTML = `
      <div class="detail-grid">
        <div class="detail-card">
          <label>Implied Value</label>
          <value style="color:var(--primary); font-size:1.25rem;">${formatUSD(row.implied_value_usd)}</value>
        </div>
        <div class="detail-card">
          <label>TVL</label>
          <value>${formatUSD(row.tvl_usd)}</value>
        </div>
        <div class="detail-card">
          <label>7d Change</label>
          <value>${formatPct(row.change_7d)}</value>
        </div>
        <div class="detail-card">
          <label>Age & Confidence</label>
          <value>${row.age_days !== null ? row.age_days + ' days' : 'Unknown'} (${row.confidence_tier})</value>
        </div>
      </div>

      <h3 style="margin-bottom:0.5rem; font-size:1rem;">Model Factor Breakdown</h3>
      <div class="detail-grid" style="margin-bottom:1.5rem;">
        <div class="detail-card">
          <label>Growth Factor</label>
          <value>${row.growth_factor}×</value>
        </div>
        <div class="detail-card">
          <label>Age Factor</label>
          <value>${row.age_factor}×</value>
        </div>
        <div class="detail-card">
          <label>Chain Factor</label>
          <value>${row.chain_factor}×</value>
        </div>
        <div class="detail-card">
          <label>Category Factor</label>
          <value>${row.category_factor}×</value>
        </div>
      </div>

      <h3 style="margin-bottom:0.5rem; font-size:1rem;">Concrete Farm Plan (Capital Tier: $${capital}, Hold: ${hold}d)</h3>
      <ol class="farm-steps-list">
        <li>Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.</li>
        <li>Deposit $${capital} of USDC into ${row.name} on ${chain} and keep the position open. Cost: $${capital} of capital and about $4 of gas. Time: 15 minutes to set up.</li>
        <li>Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.</li>
        <li>Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${hold} days.</li>
        <li>Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.</li>
        <li>Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.</li>
      </ol>
    `;
    detailPanel.classList.add('active');
  }

  detailClose.onclick = () => {
    activeDetailSlug = null;
    updateHash();
    detailPanel.classList.remove('active');
  };

  // Event listeners
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      document.getElementById('boardControls').style.display = currentTab === 'board' ? 'flex' : 'none';
      if (currentTab === 'live') {
        detailPanel.classList.remove('active');
      }
      renderTable();
    };
  });

  searchInput.oninput = (e) => {
    searchTerm = e.target.value;
    updateHash();
    renderTable();
  };

  categorySelect.onchange = (e) => {
    selectedCategory = e.target.value;
    updateHash();
    renderTable();
  };

  chainSelect.onchange = (e) => {
    selectedChain = e.target.value;
    renderTable();
  };

  watchlistOnlyCheck.onchange = (e) => {
    watchlistOnly = e.target.checked;
    updateHash();
    renderTable();
  };

  sortSelect.onchange = (e) => {
    sortBy = e.target.value;
    renderTable();
  };

  parseHash();
  renderTable();
})();
