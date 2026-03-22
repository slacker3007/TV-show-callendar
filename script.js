/**
 * TV Pulse - Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentStartDate = new Date('2026-03-22');
    let activeFilter = 'all';
    let activeView = 'weekly';
    const POPULAR_THRESHOLD = 60;
    
    let blacklistedShows = JSON.parse(localStorage.getItem('tvpulse_blacklist') || '[]');

    // Elements
    const calendarGrid = document.getElementById('calendar-grid');
    const rangeDisplay = document.getElementById('current-range');
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const viewBtns = document.querySelectorAll('.view-btn');
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
                renderCalendar();
            };
        });

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
    }

    function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

    async function renderCalendar() {
        calendarGrid.innerHTML = '<div class="loading">Syncing schedule...</div>';
        
        let days = 7;
        let start = new Date(currentStartDate);

        if (activeView === 'monthly') {
            const y = start.getFullYear(), m = start.getMonth();
            start = new Date(y, m, 1);
            days = new Date(y, m + 1, 0).getDate();
            rangeDisplay.textContent = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
            
            // Throttling to respect TVMaze's 20 req / 10 sec limit
            if (i > 0 && i % 8 === 0) await delay(400); 
            fetchDay(date, dayEl);
        }
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
        const iso = date.toISOString().split('T')[0];
        const list = el.querySelector('.show-list');
        try {
            const [r1, r2] = await Promise.all([
                fetch(`https://api.tvmaze.com/schedule?country=US&date=${iso}`),
                fetch(`https://api.tvmaze.com/schedule/web?country=US&date=${iso}`)
            ]);
            if (!r1.ok || !r2.ok) throw new Error();
            const d1 = await r1.json(), d2 = await r2.json();
            
            let eps = [...d1, ...d2].filter(e => {
                if (!e.show) return false;
                
                const show = e.show;
                const showId = show.id;
                const genres = show.genres || [];
                const type = show.type || '';
                
                // Blacklist check
                if (blacklistedShows.includes(showId)) return false;
                
                // Policy: Filter out News and Sports
                const isNewsOrSports = 
                    type === 'News' || 
                    type === 'Sports' || 
                    genres.includes('News') || 
                    genres.includes('Sports');
                
                if (isNewsOrSports) return false;
                
                return true;
            });
            const seen = new Set();
            eps = eps.filter(e => seen.has(e.id) ? false : seen.add(e.id));
            eps.sort((a,b) => (a.airtime || '00:00') > (b.airtime || '00:00') ? 1 : -1);
            
            renderEps(eps, list);
        } catch (e) { list.innerHTML = '<div class="error">!</div>'; }
    }

    function renderEps(eps, container) {
        container.innerHTML = '';
        let filtered = eps;
        if (activeFilter === 'popular') filtered = eps.filter(e => (e.show.weight || 0) >= POPULAR_THRESHOLD);

        if (filtered.length === 0) { container.innerHTML = '<div class="no-episodes">-</div>'; return; }

        filtered.forEach(e => {
            const card = document.createElement('div');
            card.className = 'show-card';
            const isPop = (e.show.weight || 0) >= POPULAR_THRESHOLD;
            if (activeView === 'weekly' && isPop) card.classList.add('popular');

            const img = activeView === 'weekly' ? `<div class="image-container"><img src="${e.show.image?.medium || ''}" alt=""></div>` : '';
            
            card.innerHTML = `
                ${img}
                <button class="hide-btn" title="Hide forever"><i class="ri-close-line"></i></button>
                <div class="card-content">
                    <h4>${e.show.name}</h4>
                    <p class="episode-info">S${e.season}E${e.number}</p>
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

    function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    function isToday(d) { 
        const today = new Date('2026-03-22');
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }
});
