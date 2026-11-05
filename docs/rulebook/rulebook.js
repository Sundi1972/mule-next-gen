/* M.U.L.E. Next Gen rulebook: the shared chapter rail, the page contents and search.
   The chapter list lives here once; search reads window.RULEBOOK_INDEX from search-index.js,
   which `node docs/rulebook/build-index.mjs` regenerates from the chapter pages. */
(function () {
  var CHAPTERS = [
    ['index.html', 'Start here', 'What this book is, how to read it, how it is kept current'],
    ['game-flow.html', 'The game at a glance', 'Players, months, phases, the clock, how you win'],
    ['land.html', 'Land and geology', 'The map, ground ratings, the land grant and land auction, the drone and assays'],
    ['development.html', 'Development', 'Walking the floor, MULEs, outfits, installing, the pub, hunger and sickness'],
    ['production.html', 'Production', 'What plots make, Energy and Water, factories, pollution'],
    ['goods-auction.html', 'The goods auction', 'Buying and selling on the walk board, the store lines, deals and speed'],
    ['store-and-prices.html', 'The store and prices', 'How prices move, the spread, restocking, the export ship, Crystite'],
    ['colony-and-politics.html', 'Colony and politics', 'Mood, air, buildings, the council, laws, offices, strikes and riots'],
    ['events.html', 'Events', 'Every event, when it fires and what it does'],
    ['computer-players.html', 'Computer players', 'How the AI seats think, plan and trade, and Claude as a player'],
    ['table-and-phones.html', 'The table and the phones', 'What the TV shows, what each phone shows, solo play'],
    ['open-designs.html', 'Open designs and backlog', 'Everything not designed yet or due to be improved'],
    ['numbers.html', 'Every number', 'All balancing values from the game’s settings, with what each does']
  ];
  window.RULEBOOK_CHAPTERS = CHAPTERS;
  var here = location.pathname.split('/').pop() || 'index.html';

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  function buildRail() {
    var rail = document.querySelector('.rb-rail');
    if (!rail) return;
    var brand = el('a', { href: 'index.html', class: 'rb-brand' }, 'M.U.L.E. Next Gen');
    brand.appendChild(el('small', null, 'Rulebook and design book'));
    rail.appendChild(brand);
    var menu = el('button', { class: 'rb-menu', type: 'button', 'aria-expanded': 'false' }, 'Chapters');
    menu.addEventListener('click', function () {
      var open = rail.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    rail.appendChild(menu);
    var nav = el('nav', { class: 'rb-nav', 'aria-label': 'Chapters' });
    CHAPTERS.forEach(function (c, i) {
      var a = el('a', { href: c[0], title: c[2] });
      a.appendChild(el('span', { class: 'n' }, i === 0 ? '' : String(i)));
      a.appendChild(el('span', null, c[1]));
      if (c[0] === here) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    rail.appendChild(nav);
    var heads = document.querySelectorAll('article h2[id]');
    if (heads.length) {
      var toc = el('nav', { class: 'rb-toc', 'aria-label': 'On this page' });
      heads.forEach(function (h) {
        var label = h.cloneNode(true);
        label.querySelectorAll('.pill').forEach(function (p) { p.remove(); });
        toc.appendChild(el('a', { href: '#' + h.id }, label.textContent.trim()));
      });
      rail.appendChild(toc);
    }
  }

  function words(q) { return q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 1; }); }

  function snippet(text, ws) {
    var low = text.toLowerCase(), at = -1;
    for (var i = 0; i < ws.length && at < 0; i++) at = low.indexOf(ws[i]);
    var start = Math.max(0, at - 60);
    var s = (start > 0 ? '…' : '') + text.slice(start, start + 200) + (start + 200 < text.length ? '…' : '');
    return s;
  }

  function highlight(parent, s, ws) {
    var re = new RegExp('(' + ws.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    var last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index)));
      parent.appendChild(el('mark', null, m[0]));
      last = m.index + m[0].length;
    }
    if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last)));
  }

  function buildSearch() {
    var main = document.querySelector('.rb-main');
    if (!main) return;
    var box = el('div', { class: 'rb-search', role: 'search' });
    var input = el('input', { type: 'search', id: 'rb-q', placeholder: 'Search the rulebook: try "energy", "spread", "drone", "strike"', 'aria-label': 'Search the rulebook', autocomplete: 'off' });
    var out = el('div', { class: 'rb-results', id: 'rb-results', hidden: '' });
    box.appendChild(input); box.appendChild(out);
    main.insertBefore(box, main.firstChild);
    var index = window.RULEBOOK_INDEX || [];
    var titles = {};
    CHAPTERS.forEach(function (c) { titles[c[0]] = c[1]; });

    function run() {
      var ws = words(input.value);
      out.textContent = '';
      if (!ws.length) { out.hidden = true; return; }
      var hits = [];
      index.forEach(function (e) {
        var t = (e.title + ' ' + e.text).toLowerCase();
        if (!ws.every(function (w) { return t.indexOf(w) >= 0; })) return;
        var score = 0, tl = e.title.toLowerCase();
        ws.forEach(function (w) { if (tl.indexOf(w) >= 0) score += 10; score += Math.min(5, t.split(w).length - 1); });
        hits.push({ e: e, score: score });
      });
      hits.sort(function (a, b) { return b.score - a.score; });
      out.hidden = false;
      if (!hits.length) { out.appendChild(el('div', { class: 'none' }, 'Nothing found. Try fewer or shorter words.')); return; }
      hits.slice(0, 30).forEach(function (h) {
        var a = el('a', { href: h.e.page + '#' + h.e.id });
        a.appendChild(el('div', { class: 'where' }, (titles[h.e.page] || h.e.page) + (h.e.status ? '  ·  ' + h.e.status : '')));
        var t = el('div'); highlight(t, h.e.title, ws); a.appendChild(t);
        var sn = el('div', { class: 'snip' }); highlight(sn, snippet(h.e.text, ws), ws); a.appendChild(sn);
        out.appendChild(a);
      });
    }
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { input.value = ''; run(); }
      if (ev.key === 'Enter') { var first = out.querySelector('a'); if (first) location.href = first.getAttribute('href'); }
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && document.activeElement !== input) { ev.preventDefault(); input.focus(); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () { buildRail(); buildSearch(); });
})();
