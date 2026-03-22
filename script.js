/**
 * TV Pulse - Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentStartDate = new Date('2026-03-22');
    let activeFilter = 'popular'; // default to popular hits as requested
    let activePlatform = null; // platforms removed from UI but keeping for code logic safety
    let activeView = 'weekly';
    const POPULAR_THRESHOLD = 50; // Lowered to include more "2026 hits"
    
    let blacklistedShows = JSON.parse(localStorage.getItem('tvpulse_blacklist') || '[]');

    // Elements
    const calendarGrid = document.getElementById('calendar-grid');
    const rangeDisplay = document.getElementById('current-range');
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const viewBtns = document.querySelectorAll('.view-btn');
    const searchInput = document.getElementById('show-search');
    const blacklistedView = document.getElementById('calendar-grid'); // Reusing calendar grid for now
    const hiddenControls = document.getElementById('hidden-controls');
    const exportBtn = document.getElementById('export-blacklist');
    const importBtn = document.getElementById('import-blacklist');
    const importInput = document.getElementById('import-file');
    const clearBlacklistBtn = document.getElementById('clear-blacklist');

    init();

    function init() {
        renderCalendar();
        setupEvents();
    }

    function setupEvents() {
        prevBtn.onclick = () => {
            if (activeView === 'weekly') currentStartDate.setDate(currentStartDate.getDate() - 7);
            else { currentStartDate.setMonth(currentStartDate.getMonth() - 1); currentStartDate.setDate(1); }
            renderCalendar();
        };

        nextBtn.onclick = () => {
            if (activeView === 'weekly') currentStartDate.setDate(currentStartDate.getDate() + 7);
            else { currentStartDate.setMonth(currentStartDate.getMonth() + 1); currentStartDate.setDate(1); }
            renderCalendar();
        };

        filterBtns.forEach(btn => {
            btn.onclick = () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                
                // Toggle hidden controls visibility
                if (activeFilter === 'hidden') {
                    hiddenControls.style.display = 'flex';
                    prevBtn.style.display = 'none';
                    nextBtn.style.display = 'none';
                } else {
                    hiddenControls.style.display = 'none';
                    prevBtn.style.display = 'flex';
                    nextBtn.style.display = 'flex';
                }
                
                renderCalendar();
            };
        });

        searchInput.oninput = () => {
            // Live search in currently rendered grid
            const query = searchInput.value.toLowerCase();
            const cards = document.querySelectorAll('.show-card');
            cards.forEach(card => {
                const name = card.querySelector('h4').textContent.toLowerCase();
                card.style.display = name.includes(query) ? 'block' : 'none';
            });
        };

        viewBtns.forEach(btn => {
            btn.onclick = () => {
                viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeView = btn.dataset.view;
                if (activeView === 'monthly') {
                    currentStartDate.setDate(1);
                    calendarGrid.classList.add('monthly');
                } else {
                    calendarGrid.classList.remove('monthly');
                }
                renderCalendar();
            };
        });

        clearBlacklistBtn.onclick = () => {
            if (confirm('Show all hidden shows again?')) {
                blacklistedShows = [];
                localStorage.removeItem('tvpulse_blacklist');
                renderCalendar();
            }
        };

        exportBtn.onclick = () => {
            if (blacklistedShows.length === 0) return alert('Nothing to export!');
            
            // For export, we try to gather some info if possible, but IDs are the core.
            // Let's just export the IDs for now as that's what we store.
            const dataStr = JSON.stringify(blacklistedShows, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tvpulse_blacklist_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        importBtn.onclick = () => importInput.click();

        importInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (Array.isArray(imported)) {
                        if (confirm(`Import ${imported.length} shows? This will MERGE with your current list.`)) {
                            // Merge and unique
                            blacklistedShows = [...new Set([...blacklistedShows, ...imported])];
                            localStorage.setItem('tvpulse_blacklist', JSON.stringify(blacklistedShows));
                            renderCalendar();
                        }
                    } else {
                        alert('Invalid file format. Please upload a JSON array of show IDs.');
                    }
                } catch (err) {
                    alert('Error parsing file.');
                }
            };
            reader.readAsText(file);
        };
    }

    function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

    async function renderCalendar() {
        if (activeFilter === 'hidden') {
            return renderHiddenShows();
        }

        calendarGrid.innerHTML = '<div class="loading">Syncing schedule...</div>';
        calendarGrid.classList.remove('hidden-view-grid'); // Reset special layout
        
        let days = 7;
        let start = new Date(currentStartDate);

        if (activeView === 'monthly') {
            const y = start.getFullYear(), m = start.getMonth();
            start = new Date(y, m, 1);
            days = new Date(y, m + 1, 0).getDate();
            const monthStr = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            rangeDisplay.textContent = monthStr;
        } else {
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            rangeDisplay.textContent = `${fmtDate(start)} - ${fmtDate(end)}`;
        }

        calendarGrid.innerHTML = '';

        for (let i = 0; i < days; i++) {
            const date = new Date(start);
            date.setDate(date.getDate() + i);
            const dayEl = createDayEl(date);
            calendarGrid.appendChild(dayEl);
            
            // Safer throttling for TVMaze (20 req / 10 sec)
            if (i > 0 && i % 4 === 0) await delay(1000); 
            fetchDay(date, dayEl);
        }
    }

    async function renderHiddenShows() {
        calendarGrid.innerHTML = '<div class="loading">Loading hidden series...</div>';
        calendarGrid.classList.add('hidden-view-grid');
        rangeDisplay.textContent = 'Permanently Hidden Series';

        if (blacklistedShows.length === 0) {
            calendarGrid.innerHTML = '<div class="no-episodes" style="grid-column: 1/-1;">You haven\'t hidden any shows yet. Use the close icon on any show card to hide it forever.</div>';
            return;
        }

        // Fetch details for all blacklisted shows in chunks
        const showsDetails = [];
        const CHUNK_SIZE = 5;
        for (let i = 0; i < blacklistedShows.length; i += CHUNK_SIZE) {
            const chunk = blacklistedShows.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(
                chunk.map(id => fetch(`https://api.tvmaze.com/shows/${id}`).then(r => r.ok ? r.json() : null))
            );
            showsDetails.push(...results.filter(s => s !== null));
            if (i + CHUNK_SIZE < blacklistedShows.length) await delay(300);
        }

        calendarGrid.innerHTML = '';
        
        if (showsDetails.length === 0) {
            calendarGrid.innerHTML = '<div class="no-episodes" style="grid-column: 1/-1;">Could not fetch show details.</div>';
            return;
        }

        showsDetails.forEach(show => {
            const card = document.createElement('div');
            card.className = 'show-card hidden-item';
            
            const platformName = show.webChannel?.name || show.network?.name || '';
            const platformClass = getPlatformClass(platformName);
            const platformLabel = platformName ? `<span class="platform-label ${platformClass}">${platformName}</span>` : '';
            const rating = show.rating?.average ? `<div class="rating"><i class="ri-star-fill"></i> ${show.rating.average}</div>` : '';

            card.innerHTML = `
                <div class="image-container"><img src="${show.image?.medium || ''}" alt=""></div>
                <button class="unhide-btn" title="Undo hide"><i class="ri-refresh-line"></i></button>
                <div class="card-content">
                    <div class="card-top-info">
                        ${platformLabel}
                        ${rating}
                    </div>
                    <h4>${show.name}</h4>
                    <p class="episode-info">${show.genres ? show.genres.join(', ') : ''}</p>
                    <div class="time">${show.status}</div>
                </div>
            `;
            
            card.querySelector('.unhide-btn').onclick = (ev) => {
                ev.stopPropagation();
                blacklistedShows = blacklistedShows.filter(id => id !== show.id);
                localStorage.setItem('tvpulse_blacklist', JSON.stringify(blacklistedShows));
                renderHiddenShows();
            };
            
            card.onclick = () => window.open(show.url, '_blank');
            calendarGrid.appendChild(card);
        });
    }

    function createDayEl(date) {
        const div = document.createElement('div');
        div.className = 'calendar-day';
        if (isToday(date)) div.classList.add('today');
        div.innerHTML = `
            <div class="day-header">
                <span class="day-name">${date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span class="day-number">${date.getDate()}</span>
            </div>
            <div class="show-list">
                <div class="skeleton-list"><div class="skeleton-item" style="height:60px"></div></div>
            </div>
        `;
        return div;
    }

    async function fetchDay(date, el) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const iso = `${y}-${m}-${d}`;
        
        const list = el.querySelector('.show-list');
        try {
            // Fetch TV Network schedule for US and Web schedule for ALL countries
            // We use .then to swallow errors and return empty list on individual failures
            const [r1, r2] = await Promise.all([
                fetch(`https://api.tvmaze.com/schedule?country=US&date=${iso}`).then(r => r.ok ? r.json() : []),
                fetch(`https://api.tvmaze.com/schedule/web?date=${iso}`).then(r => r.ok ? r.json() : [])
            ]);
            
            let eps = [...r1, ...r2].filter(e => {
                if (!e || !e.show) return false;
                
                const show = e.show;
                const genres = show.genres || [];
                const type = show.type || '';
                
                // Content Filter: English Only
                if (show.language && show.language !== 'English') return false;
                
                // Blacklist check
                if (blacklistedShows.includes(show.id)) return false;
                
                // Pass if a platform is active, otherwise filter News/Sports
                if (!activePlatform) {
                    const isNewsOrSports = 
                        type === 'News' || type === 'Sports' || 
                        genres.includes('News') || genres.includes('Sports');
                    if (isNewsOrSports) return false;
                }
                
                return true;
            });

            const seen = new Set();
            eps = eps.filter(e => seen.has(e.id) ? false : seen.add(e.id));
            eps.sort((a,b) => (a.airtime || '00:00') > (b.airtime || '00:00') ? 1 : -1);
            
            renderEps(eps, list);
        } catch (e) { 
            console.error('Fetch error:', e);
            list.innerHTML = '<div class="error"><i class="ri-error-warning-line"></i></div>'; 
        }
    }

    function renderEps(eps, container) {
        container.innerHTML = '';
        let filtered = eps;
        
        // Extended Filters
        if (!activePlatform) {
            if (activeFilter === 'popular') {
                filtered = filtered.filter(e => (e.show.weight || 0) >= POPULAR_THRESHOLD);
            } else if (activeFilter === 'rated') {
                filtered = filtered.filter(e => (e.show.rating?.average || 0) >= 8.0);
            } else if (activeFilter === 'running') {
                filtered = filtered.filter(e => e.show.status?.toLowerCase() === 'running');
            }
        }

        if (activePlatform) {
            const p = activePlatform.toLowerCase();
            filtered = filtered.filter(e => {
                const nwObj = e.show.network || {};
                const wbObj = e.show.webChannel || {};
                const n = (nwObj.name || "").toLowerCase();
                const w = (wbObj.name || "").toLowerCase();
                const total = n + '|' + w;
                
                let matches = false;
                if (p === 'netflix') matches = total.includes('netflix');
                else if (p === 'hbo') matches = total.includes('hbo') || total.includes('max');
                else if (p === 'disney+') matches = total.includes('disney');
                else if (p === 'hulu') matches = total.includes('hulu');
                else if (p === 'prime video') matches = total.includes('amazon') || total.includes('prime');
                else matches = total.includes(p);

                if (!matches) return false;

                // Combine with secondary filters
                if (activeFilter === 'rated') return (e.show.rating?.average || 0) >= 7.5; // Slightly more lenient for platforms
                if (activeFilter === 'running') return e.show.status?.toLowerCase() === 'running';
                
                return true;
            });
        }

        if (filtered.length === 0) { container.innerHTML = '<div class="no-episodes">-</div>'; return; }

        filtered.forEach(e => {
            const card = document.createElement('div');
            card.className = 'show-card';
            const isPop = (e.show.weight || 0) >= POPULAR_THRESHOLD;
            if (activeView === 'weekly' && isPop) card.classList.add('popular');
            if (e.number === 1) card.classList.add('season-premiere');

            const img = activeView === 'weekly' ? `<div class="image-container"><img src="${e.show.image?.medium || ''}" alt=""></div>` : '';
            
            const platformName = e.show.webChannel?.name || e.show.network?.name || '';
            const platformClass = getPlatformClass(platformName);
            const platformLabel = platformName ? `<span class="platform-label ${platformClass}">${platformName}</span>` : '';

            // Get Rating and Status for card
            const rating = e.show.rating?.average ? `<div class="rating"><i class="ri-star-fill"></i> ${e.show.rating.average}</div>` : '';
            const isRunning = e.show.status?.toLowerCase() === 'running';
            const statusBadge = isRunning ? '' : `<span class="status-badge">${e.show.status}</span>`;

            card.innerHTML = `
                ${img}
                <button class="hide-btn" title="Hide forever"><i class="ri-close-line"></i></button>
                <div class="card-content">
                    <div class="card-top-info">
                        ${platformLabel}
                        ${rating}
                    </div>
                    <h4>${e.show.name}</h4>
                    <p class="episode-info">S${e.season}E${e.number} ${statusBadge}</p>
                    <div class="time">${e.airtime || 'Stream'}</div>
                </div>
            `;
            card.querySelector('.hide-btn').onclick = (ev) => {
                ev.stopPropagation();
                if (!blacklistedShows.includes(e.show.id)) {
                    blacklistedShows.push(e.show.id);
                    localStorage.setItem('tvpulse_blacklist', JSON.stringify(blacklistedShows));
                    renderCalendar();
                }
            };
            card.onclick = () => window.open(e.show.url, '_blank');
            container.appendChild(card);
        });
    }

    function getPlatformClass(name) {
        if (!name) return '';
        const n = name.toLowerCase();
        if (n.includes('netflix')) return 'netflix';
        if (n.includes('hbo') || n.includes('max')) return 'hbo';
        if (n.includes('disney')) return 'disney';
        if (n.includes('hulu')) return 'hulu';
        if (n.includes('prime') || n.includes('amazon')) return 'prime';
        return '';
    }

    function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    function isToday(d) { 
        const today = new Date('2026-03-22');
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }
});
