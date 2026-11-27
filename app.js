  // ── View switching ────────────────────────────────────────────────────
  // One enum on the app state drives the whole screen: body[data-view] picks
  // which rows render (CSS) and which destination is marked selected. In iced
  // this is `state.view` rebuilt on nav click. Home is the brand wordmark.
  // Only the wordmark and the nav items are destinations. `<body>` also carries
  // data-view (it holds the current value), so it must not be selected here.
  // The bar's links, the wordmark, and the same destinations as they appear in the
  // burger's menu on a phone.
  const destinations = [
    ...document.querySelectorAll('.nav-link[data-view], .brand[data-view], .menu__nav [data-view]')
  ];

  // ── Featured billboard ────────────────────────────────────────────────
  // Six titles per destination, rendered from state: the same shape an iced
  // port would hold as `state.hero: Vec<HeroSlide>` plus a `usize` index. The
  // catalogue fills both.
  let heroTitles = {};
  let heroSets = { home: [], movies: [], tv: [], anime: [] };

  const CTA_LABELS = { movie: 'Watch Movie', tv: 'Watch Show', anime: 'Watch Anime' };

  const heroEl = document.querySelector('.hero');
  const heroStage = document.querySelector('.hero__stage');
  const heroMedia = document.querySelector('.hero__media');
  const heroContent = document.querySelector('.hero__content');
  const heroTitleText = document.querySelector('.hero__title-text');
  const heroLogo = document.querySelector('.hero__logo');
  const heroFacts = document.querySelector('.hero__facts');
  const heroDesc = document.querySelector('.hero__desc');
  const heroKind = heroFacts.querySelector('.preview__kind');
  const heroRelease = heroFacts.querySelector('.preview__release');
  const heroCert = heroFacts.querySelector('.preview__cert');
  const heroRating = heroFacts.querySelector('.preview__rating');
  const heroRatingValue = heroFacts.querySelector('.preview__rating-value');
  const heroGenres = heroFacts.querySelector('.hero__genres');
  const heroRuntime = heroFacts.querySelector('.hero__runtime');
  const heroCta = document.querySelector('.hero__cta');
  const heroDots = [...document.querySelectorAll('.dot')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let heroIndex = 0;
  // True until the catalogue answers: the billboard stays blank rather than
  // painting a title, logo and backdrop that a later stage would replace.
  let heroPending = true;

  let copyGhost = null;

  // The billboard swaps in one paint. Animating a second full-window artwork
  // layer (opacity + slide) measured 26.8ms per frame here — the page dropped to
  // ~30fps for the whole transition — so the motion is carried by the copy
  // alone. That is the part that reads as the hero changing, and it keeps the
  // frame budget at 60fps.
  // One custom property feeds both the artwork and the bleed behind it, so the
  // two can never show different slides.
  // Only the opacity moves, and only one layer moves with it: a second
  // full-window artwork animating over the first measured 26.8ms a frame, while
  // fading this one up from the page's black is a single composited property on
  // a layer that is already there. The artwork is swapped in on the same frame
  // the layer goes to nothing, so the new picture can never flash at full
  // strength before its fade starts, and the fade itself waits for the file to
  // decode: a slide arrives as a whole picture, never as a half-painted one.
  let shownArt = '';
  const showBackdrop = (image) => {
    // The same slide painted again (the dot already selected, a view switch to
    // a title both tabs share) is not a new picture: fading it would flash.
    if (image === shownArt) return;
    shownArt = image;
    const still = reduceMotion.matches;
    if (!still) {
      heroMedia.style.transition = 'none';
      heroMedia.style.opacity = '0';
    }
    heroStage.style.setProperty('--art', `url("${image}")`);
    if (still) return;
    const fadeUp = () => {
      heroMedia.style.transition = 'opacity 420ms ease-out';
      heroMedia.style.opacity = '1';
    };
    const art = new Image();
    art.src = image;
    if (art.decode) art.decode().then(fadeUp, fadeUp);
    else if (art.complete) fadeUp();
    else art.addEventListener('load', fadeUp, { once: true });
  };

  // Same idea for the copy: snapshot the outgoing slide above the incoming one,
  // then move both. The clone carries no handlers and ignores pointer events.
  const swapCopy = (direction, apply) => {
    if (copyGhost) {
      copyGhost.remove();
      copyGhost = null;
    }
    if (!direction || reduceMotion.matches) {
      apply();
      return;
    }
    const box = heroContent.getBoundingClientRect();
    const ghost = heroContent.cloneNode(true);
    ghost.classList.add('hero__ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${box.width}px`;
    // The same height, so the clone centres its own content exactly where the
    // live copy does: an auto-height clone is content-tall and sits at the top.
    ghost.style.height = `${box.height}px`;
    // Placed by measurement rather than arithmetic: the hero is a padded grid
    // container, and a clone positioned against it starts from a different
    // origin than getBoundingClientRect reports, which put the outgoing copy one
    // padding down and to the right of the incoming one. Zero it, read where it
    // lands, then offset by the difference — correct whatever that origin is.
    ghost.style.left = '0px';
    ghost.style.top = '0px';
    heroEl.append(ghost);
    const origin = ghost.getBoundingClientRect();
    ghost.style.left = `${box.left - origin.left}px`;
    ghost.style.top = `${box.top - origin.top}px`;
    copyGhost = ghost;

    apply();

    const travel = Math.round(Math.max(28, Math.min(72, box.width * 0.09)));
    const timing = { duration: 460, easing: 'cubic-bezier(.33,0,.2,1)' };
    ghost.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${-direction * travel}px)`, opacity: 0 }
      ],
      timing
    ).finished.then(() => {
      ghost.remove();
      if (copyGhost === ghost) copyGhost = null;
    }).catch(() => {});
    heroContent.animate(
      [
        { transform: `translateX(${direction * travel}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 }
      ],
      timing
    );
  };

  // direction: 1 = next, -1 = previous, 0 = paint without moving (view switch,
  // live catalogue refresh, clicking the dot already selected).
  const renderHero = (index, direction = 0) => {
    // Nothing painted before the catalogue answers: a slide built on nothing
    // would be a title, a logo and a backdrop the first payload replaces outright.
    if (heroPending) return;
    const keys = heroSets[document.body.dataset.view] || heroSets.home;
    heroIndex = (index + keys.length) % keys.length;
    const slide = heroTitles[keys[heroIndex]];
    // One slide of lead time for the next swap's decode.
    preloadSlide(keys[(heroIndex + 1) % keys.length]);

    showBackdrop(coldURL(slide.image));
    swapCopy(direction, () => {
      heroMedia.setAttribute('aria-label', `${slide.title} backdrop`);
      // The billboard prints the title's own logo art when the catalogue has
      // one; the text title stays as the fallback (and as the img's alt).
      heroTitleText.textContent = slide.title;
      heroTitleText.hidden = Boolean(slide.logo);
      heroLogo.hidden = !slide.logo;
      if (slide.logo) {
        heroLogo.src = coldURL(slide.logo);
        heroLogo.alt = slide.title;
      } else {
        // The text title stands in: the previous slide's logo goes with it
        // rather than sitting in the document as a decoded picture.
        heroLogo.removeAttribute('src');
        heroLogo.alt = '';
      }
      // The same facts the expanded card prints, from the same item fields.
      const facts = slide.facts || {};
      heroKind.textContent = slide.media === 'tv' ? 'Series' : 'Film';
      heroCert.textContent = facts.cert || '';
      heroCert.hidden = !facts.cert;
      const release = facts.release || '';
      heroRelease.textContent = RELEASE_LABELS[release] || '';
      heroRelease.dataset.state = release;
      heroRelease.hidden = !RELEASE_LABELS[release];
      // A title nobody has voted on carries 0, and is shown without a score
      // rather than with a zero.
      const score = Number(slide.rating) || 0;
      heroRating.hidden = !score;
      heroRatingValue.textContent = score ? score.toFixed(1) : '';
      heroRating.setAttribute('aria-label', score ? `Rated ${score.toFixed(1)} out of 10` : '');
      heroGenres.textContent = (facts.genres || []).join(' · ');
      heroGenres.hidden = !heroGenres.textContent;
      heroRuntime.textContent = duration({ media: slide.media, facts });
      heroRuntime.hidden = !heroRuntime.textContent;
      // The synopsis: TMDB's overview. A title without one drops the line rather
      // than leaving a gap where it would have been.
      heroDesc.textContent = slide.desc || '';
      heroDesc.hidden = !heroDesc.textContent;
      heroCta.textContent = CTA_LABELS[slide.kind];
    });

    heroDots.forEach((dot, i) => {
      // A set shorter than the six dots hides its spare dots.
      dot.hidden = i >= keys.length;
      const current = i === heroIndex;
      dot.classList.toggle('dot--active', current);
      if (current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  // ── Auto-advance ─────────────────────────────────────────────────────
  // The billboard moves on by itself every ten seconds. A manual move restarts
  // the clock, so a slide the viewer picked gets its whole turn instead of the
  // remainder of the one it interrupted — and a record still loading, or a tab
  // in the background, does not tick at all: nothing is being watched either
  // way, and each tick costs a ghost snapshot and a decode.
  const HERO_INTERVAL = 10000;
  let heroTimer = 0;

  const restartHeroCycle = () => {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
      if (document.hidden || heroPending) return;
      const keys = heroSets[document.body.dataset.view] || heroSets.home;
      if (keys.length > 1) renderHero(heroIndex + 1, 1);
    }, HERO_INTERVAL);
  };

  const stepHero = (index, direction) => {
    renderHero(index, direction);
    restartHeroCycle();
  };

  document.querySelector('.hero__prev').addEventListener('click', () => stepHero(heroIndex - 1, -1));
  document.querySelector('.hero__next').addEventListener('click', () => stepHero(heroIndex + 1, 1));
  heroDots.forEach((dot, i) => dot.addEventListener('click', () => {
    // A dot slides toward itself from the current slide; the active dot is a
    // no-op repaint.
    stepHero(i, Math.sign(i - heroIndex));
  }));

  restartHeroCycle();

  // ── The player ───────────────────────────────────────────────────────
  // Only the hover card plays a trailer now: the billboard is stills alone, so
  // the page never starts a video on its own. The card uses YouTube's own
  // embed — `controls=0` is the one thing a clean player has to accept, and
  // this is the only one that does; its chrome is cropped by the frame's own
  // overflow instead (see .preview__trailer).
  const youtubeEmbed = (key) =>
    `https://www.youtube-nocookie.com/embed/${key}`
    + '?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&modestbranding=1'
    + '&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&cc_load_policy=0'
    + `&origin=${encodeURIComponent(location.origin)}`;

  // ── Top-bar menus ────────────────────────────────────────────────────
  // The burger and the account pill each hang a panel under themselves. One
  // registry keeps them mutually exclusive, and every close path — second
  // click, outside press, Escape, picking an item — updates aria-expanded, so
  // a button never disagrees with what is on screen.
  const menuList = [];
  const setupMenu = (button, panel) => {
    const menu = { button, panel, wrap: button.closest('.menu-wrap') };
    menu.set = (open) => {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => {
      const open = panel.hidden;
      menuList.forEach((other) => other !== menu && other.set(false));
      menu.set(open);
    });
    panel.addEventListener('click', (event) => {
      if (event.target.closest('.menu__item')) menu.set(false);
    });
    menuList.push(menu);
  };

  setupMenu(document.querySelector('.icon-btn--burger'), document.querySelector('#main-menu'));
  setupMenu(document.querySelector('.profile'), document.querySelector('#account-menu'));

  // `pointerdown` rather than `click`, so a menu is gone before the press
  // underneath lands on a card or a nav link. A press inside either wrapper
  // leaves that one alone, so clicking the other trigger swaps panels.
  document.addEventListener('pointerdown', (event) => {
    const inside = event.target.closest('.menu-wrap');
    menuList.forEach((menu) => {
      if (!menu.panel.hidden && menu.wrap !== inside) menu.set(false);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    menuList.forEach((menu) => {
      if (menu.panel.hidden) return;
      menu.set(false);
      menu.button.focus();
    });
  });

  // Decode a slide's artwork so a swap never stalls on a full-window JPEG.
  const preloadSlide = (key) => {
    const slide = heroTitles[key];
    if (!slide) return;
    // Bundled slide art belongs to the fallback catalogue: decoding three of
    // those JPEGs up front only competes with the live artwork that replaces
    // them a moment later, so it waits until the slide is actually shown.
    [slide.image, slide.logo]
      .filter(Boolean)
      .forEach((src) => {
        const image = new Image();
        image.src = coldURL(src);
        if (image.decode) image.decode().catch(() => {});
      });
  };

  // Warm the visible slide and the two after it, then one ahead as the carousel
  // advances. Decoding all six (twelve files) on first paint only contests the
  // bandwidth the shelf artwork is waiting on, and nobody sees slides 4-6 for
  // half a minute.
  const preloadHeroes = (view, count = 2) => {
    if (heroPending) return;
    (heroSets[view] || heroSets.home).slice(0, count).forEach(preloadSlide);
  };

  const setView = (view) => {
    document.body.dataset.view = view;
    renderHero(0);
    preloadHeroes(view);
    destinations.forEach((el) => {
      const selected = el.dataset.view === view;
      const isNav = el.classList.contains('nav-link');
      el.classList.toggle('nav-link--active', selected && isNav);
      el.classList.toggle('brand--active', selected && el.classList.contains('brand'));
      if (isNav && selected) el.setAttribute('aria-current', 'page');
      else if (isNav) el.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
  };

  destinations.forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      setView(el.dataset.view);
    });
  });

  // ── Search ───────────────────────────────────────────────────────────
  // The field is drawn over the nav rather than in the bar's row, so opening it
  // shifts nothing: the icon toggles it, Esc closes it (clearing the text first),
  // and a click anywhere else puts it away.
  const search = document.querySelector('#topbar-search');
  const searchToggle = document.querySelector('#search-toggle');
  const searchInput = document.querySelector('#search-input');
  const searchFilter = document.querySelector('#search-filter');

  // The field is drawn over the nav, so it may take only the room between the
  // shell and the wordmark: at a narrow window the full width would run over it.
  const brand = document.querySelector('.brand');
  const sizeSearch = () => {
    // On a phone the field takes the bar: the wordmark, the bell and the account
    // pill step aside for it (see the phone block in styles.css), so the room it
    // has is the window's rather than the gap up to a wordmark that has gone.
    if (window.innerWidth <= 700) {
      // Measured from the shell's own right edge, not the window's: the page's
      // scrollbar takes room the window count still includes, and a field sized
      // off the window would start under the screen's left edge.
      const edge = search.getBoundingClientRect().right;
      search.style.setProperty('--search-w', `${Math.max(200, Math.round(edge - 8))}px`);
      return;
    }
    const room = search.getBoundingClientRect().right - brand.getBoundingClientRect().right - 22;
    search.style.setProperty('--search-w', `${Math.max(200, Math.min(438, Math.round(room)))}px`);
  };

  // The query the grid was opened for, kept here because the grid reads it on
  // every window it asks for.
  let searchText = '';

  // Enter opens the search page: the grid a row's See all opens, titled with the
  // query. An empty field opens it too — the page is the catalogue to browse,
  // and the bar on it is what cuts it.
  const openSearchPage = () => {
    searchText = searchInput.value.trim();
    searchInput.blur();
    hideSuggest();
    openSeeAll('search', searchText ? `Results for “${searchText}”` : 'Search');
  };

  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    openSearchPage();
  });

  const setSearchOpen = (open) => {
    if (open) sizeSearch();
    search.classList.toggle('is-open', open);
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      requestAnimationFrame(() => {
        // Whatever stands aside for an open field — the wordmark, the bell, the
        // account pill on a phone — only goes with the class, so the shell's own
        // place is settled a frame later. Measured again here, the field takes the
        // room that has just been freed rather than the room it started with.
        sizeSearch();
        searchInput.focus({ preventScroll: true });
      });
    } else {
      searchInput.blur();
      hideSuggest();
    }
  };

  searchToggle.addEventListener('click', () => setSearchOpen(!search.classList.contains('is-open')));

  // On the whole field, not just the input: once the filter pill has been pressed
  // the focus is on that button, and Esc has to work from there too.
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (searchInput.value) {
      searchInput.value = '';
      hideSuggest();
      searchInput.focus({ preventScroll: true });
      return;
    }
    setSearchOpen(false);
    searchToggle.focus({ preventScroll: true });
  });

  window.addEventListener('resize', () => {
    if (search.classList.contains('is-open')) sizeSearch();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!search.classList.contains('is-open')) return;
    if (event.target.closest('#topbar-search')) return;
    setSearchOpen(false);
  });

  // The pill belongs to the search page's bar: away from that page, pressing it
  // goes there — and a page always opens with its tray shut, so nothing is open
  // before the reader asks for it. On the page the pill is the tray's own switch,
  // and its lit state is the tray's, not a flag of its own.
  searchFilter.addEventListener('click', () => {
    if (seeAllState.section !== 'search' || !document.body.classList.contains('is-seeing-all')) {
      openSearchPage();
      return;
    }
    if (seeAllPanel.hidden) {
      if (!seeAllTools.hidden) seeAllRenderPanel('genres');
      return;
    }
    seeAllClosePanel();
  });

  // ── Suggestions ──────────────────────────────────────────────────────
  // Typing asks for the titles the words find, half a second after the keys stop:
  // one request per pause, not one per letter, so a word typed at speed is a
  // single look up. They hang under the field as a short list. On the search page
  // that list is the page itself, so the same pause re-reads the grid in place
  // rather than opening a second answer under the bar.
  const suggest = document.querySelector('#search-suggest');
  const SUGGEST_PAUSE = 500;
  const SUGGEST_ROWS = 6;
  let suggestTimer = 0;
  let suggestAsk = 0;

  const hideSuggest = () => {
    clearTimeout(suggestTimer);
    suggestTimer = 0;
    // A reply still on the wire belongs to a query nobody is waiting for now.
    suggestAsk += 1;
    suggest.hidden = true;
    suggest.replaceChildren();
    searchInput.setAttribute('aria-expanded', 'false');
  };

  const showSuggest = (text, items) => {
    suggest.replaceChildren();
    if (!items.length) {
      const none = document.createElement('p');
      none.className = 'suggest__none';
      none.textContent = `No titles match “${text}”`;
      suggest.append(none);
    } else {
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'suggest__row';
        row.setAttribute('role', 'option');
        const art = document.createElement('img');
        art.className = 'suggest__art';
        art.alt = '';
        art.decoding = 'async';
        art.src = artFor(item.still, 64) || BLANK_ART;
        const words = document.createElement('span');
        words.className = 'suggest__words';
        const name = document.createElement('span');
        name.className = 'suggest__title';
        name.textContent = item.title;
        const meta = document.createElement('span');
        meta.className = 'suggest__meta';
        meta.textContent = [
          item.year,
          item.media === 'tv' ? 'Series' : 'Movie',
          item.rating ? item.rating.toFixed(1) : '',
        ].filter(Boolean).join(' · ');
        words.append(name, meta);
        row.append(art, words);
        // There is no page for a single title in this build: the grid is where a
        // title is looked at, and the row's own name is the search that finds it.
        row.addEventListener('click', () => {
          searchInput.value = item.title;
          openSearchPage();
        });
        suggest.append(row);
      }
    }
    suggest.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  };

  const askSuggest = (text) => {
    if (!window.catalogue) {
      hideSuggest();
      return;
    }
    const ask = ++suggestAsk;
    window.catalogue.search(text, 0, SUGGEST_ROWS)
      .then((data) => {
        if (ask !== suggestAsk) return;
        showSuggest(text, Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (ask === suggestAsk) hideSuggest();
      });
  };

  const searchPageOpen = () =>
    seeAllState.section === 'search' && document.body.classList.contains('is-seeing-all');

  // One pause, one answer.
  const typingRested = () => {
    suggestTimer = 0;
    const text = searchInput.value.trim();
    if (searchPageOpen()) {
      // The grid is this page's list: the same query shipped again, re-read from
      // the top under the cuts already on the bar. The wheel comes up with it, so
      // the page says it is looking instead of going blank between words.
      hideSuggest();
      if (text === searchText) return;
      searchText = text;
      openSeeAll('search', text ? `Results for “${text}”` : 'Search', true, true);
      return;
    }
    if (text.length < 2) {
      hideSuggest();
      return;
    }
    askSuggest(text);
  };

  searchInput.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(typingRested, SUGGEST_PAUSE);
  });

  // Down out of the field walks the list; up from the list's first row comes back.
  searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' || suggest.hidden) return;
    const first = suggest.querySelector('.suggest__row');
    if (!first) return;
    event.preventDefault();
    first.focus({ preventScroll: true });
  });

  suggest.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp') return;
    event.preventDefault();
    searchInput.focus({ preventScroll: true });
  });

  // ── Sticky top bar ───────────────────────────────────────────────────
  // The bar is fixed, so it needs its own fill as soon as content is behind
  // it; at the top of the page it stays clear against the hero artwork.
  const topbar = document.querySelector('.topbar');
  const syncTopbar = () => topbar.classList.toggle('is-pinned', window.scrollY > 8);
  let topbarPending = false;
  window.addEventListener('scroll', () => {
    if (topbarPending) return;
    topbarPending = true;
    requestAnimationFrame(() => {
      topbarPending = false;
      syncTopbar();
      // The art schedule follows the page as well as the rows: shelves coming
      // into reach are asked for, shelves left behind hand their pictures back,
      // and the cards arriving with them are put in line for their details.
      scheduleArt();
      scheduleDetails();
    });
  }, { passive: true });
  syncTopbar();

  // ── Live TV stub ─────────────────────────────────────────────────────
  const liveTvNotice = document.querySelector('#live-tv-notice');
  document
    .querySelectorAll('[data-live-tv]')
    .forEach((trigger) => trigger.addEventListener('click', () => liveTvNotice.showModal()));
  // Closed explicitly as well as via form method="dialog": the native close
  // is a no-op in some Chromium builds.
  document
    .querySelector('[data-notice-close]')
    .addEventListener('click', () => liveTvNotice.close());

  // ── Window chrome ────────────────────────────────────────────────────
  // Maximise / restore is one window control: clicking it swaps the glyph.
  // In iced this is the same button re-rendered from window::is_maximized state.
  document.querySelector('.window-btn--toggle').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const isRestore = button.dataset.state === 'restore';
    button.dataset.state = isRestore ? 'maximized' : 'restore';
    button.setAttribute('aria-label', isRestore ? 'Maximize' : 'Restore');
  });

  // ── TMDB catalogue ────────────────────────────────────────────────────
  // Everything below is fed by tmdb.js, which asks TMDB straight from the page:
  // this is a static site, so the rows, facts and artwork all arrive through
  // window.catalogue and TMDB's own CDN.
  //
  // The payload is the shape an iced port would decode straight into state:
  //   { sections: { trending: [Item], … }, hero: { home: [Item], … } }
  // A 1x1 transparent GIF: gives an empty card a valid image without a request.
  const BLANK_ART = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // One parsed template, cloned for every card. Building a markup string and
  // assigning innerHTML re-parses the same nodes each time the window slides,
  // where a clone is a copy of parsed nodes. The caption and the resume bar are
  // left out of the template and added only when an item needs them.
  const cardTemplate = document.createElement('template');
  // `draggable=false` is what stops a press-and-move on a card from lifting the
  // picture instead of pulling the row (see the drag handler in setupRow).
  // The picture has no `loading="lazy"`: the art schedule decides what is
  // fetched and when (see the schedule below), and lazy loading would second-
  // guess it — holding back the ten either side of the screen that the schedule
  // asks for on purpose.
  cardTemplate.innerHTML = '<article class="card"><div class="card__media">'
    + '<img decoding="async" draggable="false" /></div></article>';

  // The widths TMDB serves that a card can want, narrowest first. A card is
  // 250–480 CSS px wide, so at a 1x display that is 342 or 500, and only a 2x
  // display or a full-width card reaches 780.
  const ART_WIDTHS = [185, 342, 500, 780];

  // Cold start, every time: nothing may arrive out of a cache, so each load asks for its pictures under a name the browser has
  // never seen. Without the token TMDB's artwork would come straight back from
  // the HTTP cache (the server cannot set headers on another host's files), and
  // the shelf would pop in fully painted instead of filling picture by picture —
  // exactly the half of a cold start this build exists to show.
  const COLD_TOKEN = Date.now().toString(36);
  // A fresh token per load keeps a cold boot honest about what it actually
  // fetched. Inline art has nothing to cache, and a query on a data URI is not
  // a URL at all — the blank frame would fail to load for no reason.
  const coldURL = (url) => {
    if (!url || url.startsWith('data:')) return url || '';
    return `${url}${url.includes('?') ? '&' : '?'}cold=${COLD_TOKEN}`;
  };

  // The one file a slot of `cssWidth` needs at this display's pixel ratio: the
  // narrowest that still covers it. Chosen here rather than by `srcset`/`sizes`
  // for two reasons — the file is then known, so the hover panel can name the
  // same one instead of the browser resolving a second, differently sized copy
  // of the same photo; and no card can drift onto a 780 file for a 262px slot,
  // which is bytes and decode time for pixels that are thrown away.
  const artFor = (url, cssWidth, scale = 1) => {
    if (!url) return '';
    if (!url.includes('/w780/')) return coldURL(url);
    const need = Math.max(1, cssWidth) * (window.devicePixelRatio || 1) * scale;
    const width = ART_WIDTHS.find((w) => w >= need) || ART_WIDTHS[ART_WIDTHS.length - 1];
    return coldURL(url.replace('/w780/', `/w${width}/`));
  };

  // A card names two files for its slot: the one that fills it, and one at half
  // the needed pixels for the ten either side of the screen. Those are never
  // read at full size while they wait, and a decoded picture costs four bytes a
  // pixel — so a card holding its turn costs a third of one on screen, and the
  // full file is asked for the moment it is actually looked at.
  const ART_RING_SCALE = 0.5;

  const nameArt = (image, item, cssWidth) => {
    image.dataset.full = artFor(item?.still, cssWidth, 1);
    image.dataset.low = artFor(item?.still, cssWidth, ART_RING_SCALE);
    image.dataset.src = image.dataset.low || '';
  };

  // ── Art schedule ─────────────────────────────────────────────────────────
  // Pictures are asked for in the order the page is read rather than all at
  // once: the billboard paints its own, then the cards actually on screen from
  // the top row down, then the ten either side of them a row at a time — row
  // one's, row two's, and round again. Nothing outside that hold window is asked
  // for at all: the row has dropped those cards, so a picture fetched for one
  // would be handed straight back.
  // image.tmdb.org publishes no request limit at all — the only thing it caps is
  // simultaneous connections, at the same twenty per address as the API. A
  // browser opens at most six connections to one origin anyway, so the number
  // that matters here is how many pictures are asked for at once: sixteen keeps
  // the screenful moving while staying inside the published twenty.
  // image.tmdb.org publishes no request rate — only a ceiling of twenty
  // simultaneous connections per address. The screenful is held at that ceiling
  // and the ring below it, so the pictures never ask for more than the CDN
  // allows; the API's own limits are the queue in tmdb.js, not this pump.
  const ART_BATCH = 8;      // pictures in flight for the off-screen ring
  const ART_SCREEN = 20;    // the screenful the page waits on before it shows
  // How far from the fold a picture is kept. A decoded card is ~260KB of VRAM,
  // and a shelf four screens down is not being looked at: its art is handed back
  // (the URL stays on the card) and asked for again out of this session's cache
  // the moment it comes within reach.
  // A wide window shows more cards at once, and a fast flick replaces a whole
  // shelf before its pictures could arrive — so the band reaches a screen below
  // the fold rather than half of one. It is the half-size tier down there, which
  // is what keeps the reach cheap: a card waiting its turn costs a third of the
  // decoded memory of one on screen.
  const ART_ABOVE = 0.35;   // screens of artwork kept above the fold
  const ART_BELOW = 1.0;    // and below it
  // The grid is read downwards for as long as the reader keeps asking for more,
  // so it gets a whole screen above the fold — a scroll back up is the common
  // move there — but a band all the same. Everything above it used to keep its
  // picture for the life of the view, and a page of twenty-five a scroll turned
  // a list of three hundred titles into eighty megabytes of decoded artwork.
  const ART_GRID_ABOVE = 1;
  // How many times a card asks for a picture the browser could not load before
  // it gives up and keeps its dark frame.
  const ART_TRIES = 3;
  // A picture that neither loads nor errors still holds its slot: a request the
  // browser dropped when the card was re-pointed fires neither event, and eight of
  // those in a row stopped every later picture on the page. A slot is given back
  // after this long whatever the network says, and the pass asks again.
  const ART_STALE_MS = 6000;
  let artQueue = [];        // on screen, in reading order
  let artRing = [];         // the rest of the hold window, in the same order
  let artFrame = 0;

  // The card's picture is in flight: -> the function that frees its slot. Kept so
  // a card that is taken off the page mid-fetch hands its slot back instead of
  // leaving the pump waiting for an event that a cancelled request never fires.
  const artInFlight = new Map();

  // Whether a card's picture is still wanted where it is: the same band the
  // schedule holds art for, re-asked at the moment a picture comes up, because
  // the page may have moved on between the two.
  const withinHold = (box) => box.width > 0
    && box.bottom > -(window.innerHeight || 1) * ART_ABOVE
    && box.top < (window.innerHeight || 1) * (1 + ART_BELOW);

  // A grid is read as one column from the top, and the reader can be anywhere in
  // it. Two screens above them keep their picture, so a scroll back up meets
  // artwork that is already decoded; above that the card hands its picture back
  // like any other, and the pass that runs on the next scroll asks for it again
  // — out of the same session's cache, on a card that is still off screen when
  // it lands. Below the fold the grid is held to the window, and only the
  // half-size file is kept there: the full one is asked for on the screen alone.
  const withinGrid = (box) => box.width > 0
    && box.bottom > -(window.innerHeight || 1) * ART_GRID_ABOVE
    && box.top < (window.innerHeight || 1) * (1 + ART_BELOW);

  // Whether a picture is still wanted where the card now stands. The grid keeps
  // everything above the reader; a shelf keeps only its band.
  const wantedHere = (image) => {
    // A parked shelf measures at zero and would read as on screen, so its cards
    // are turned away here: nothing on it is wanted until it is woken.
    if (image.closest('.row[data-parked="1"]')) return false;
    const box = image.getBoundingClientRect();
    return image.closest('#see-all-grid') ? withinGrid(box) : withinHold(box);
  };

  const pumpArt = (cap) => {
    const limit = cap || ART_BATCH;
    const gateNow = revealed ? null : gateItems();
    // Slots are counted off the in-flight map rather than a running total: a
    // card re-pointed while its picture was on the wire replaces its own entry,
    // and a counter kept alongside that would lose the slot every time — eight
    // of those and the pump stopped for the rest of the session, which is what
    // left a grid of empty frames behind a scroll back up.
    while (artInFlight.size < limit && (artQueue.length || artRing.length)) {
      const image = artQueue.length ? artQueue.shift() : artRing.shift();
      if (!image || image.getAttribute('src')) continue;
      const src = image.dataset.src;
      // The card may have been dropped, re-pointed or left the held band since
      // the queue was built: asking for its picture now would be a fetch handed
      // straight back.
      if (!src || !image.isConnected) continue;
      // The band the card was queued under is the band it is painted under: a
      // grid card above the reader is still wanted, a shelf card above it is not.
      // Before the page is up only the leading titles of every shelf are fetched,
      // wherever they sit — the loader waits on those and nothing else, so a card
      // in the band below the fold must not take a slot from one of them. A gate
      // card still waiting on its details is passed over as well: its titled
      // cover is a different file, and fetching the list page's still first is a
      // picture the reveal throws away before it is ever seen.
      if (!revealed) {
        const item = image.closest('.card')?.__item;
        if (!gateNow || !gateNow.has(item)) continue;
        if (item && item.deferred && !item.facts) continue;
      } else if (!wantedHere(image)) {
        continue;
      }
      let stale = 0;
      const settled = () => {
        if (artInFlight.get(image) !== settled) return;
        clearTimeout(stale);
        artInFlight.delete(image);
        // The picture is on the card now, so the small stand-in behind it — the
        // list page's still, or the half-size file a card entered the window
        // with — has done its job.
        // ...unless a crossfade is running on this card: that one holds its own
        // underlay until its own fade is over, and clearing it here would show
        // the surface through a picture still at zero opacity.
        const frame = image.parentElement;
        if (frame && frame.style.backgroundImage && image.dataset.fading !== '1') {
          frame.style.backgroundImage = '';
        }
        pumpArt();
      };
      artInFlight.set(image, settled);
      stale = setTimeout(settled, ART_STALE_MS);
      image.dataset.tier = src === image.dataset.low ? 'low' : 'full';
      image.addEventListener('load', settled, { once: true });
      image.addEventListener('error', () => {
        // A request that failed is not a picture, and a card left holding a dead
        // src was never asked again — one bad moment in a burst of artwork left
        // that card dark for the rest of the session. It goes back to waiting so
        // the next pass asks again, and gives up after a few tries so a file
        // that is really gone leaves a dark frame instead of a retry storm.
        const tries = Number(image.dataset.tries || 0) + 1;
        image.dataset.tries = String(tries);
        image.removeAttribute('src');
        delete image.dataset.tier;
        if (tries >= ART_TRIES) image.dataset.dead = '1';
        settled();
      }, { once: true });
      image.src = src;
    }
  };

  // Handing a picture back: the slot it held is freed now rather than when the
  // cancelled request gets round to saying so, and the source goes so the
  // decoded bitmap goes with it.
  const parkArt = (image) => {
    if (!image) return;
    artInFlight.get(image)?.();
    if (image.getAttribute('src')) image.removeAttribute('src');
    // The half-size stand-in goes with it, so a parked card holds no picture of
    // its own at all.
    const frame = image.parentElement;
    if (frame && frame.style.backgroundImage) frame.style.backgroundImage = '';
    // A fade interrupted by the card leaving the band ends here: left on, the
    // picture would come back transparent and the underlay it holds would be the
    // only thing on the card.
    image.classList.remove('is-arriving', 'is-ready');
    delete image.dataset.fading;
    delete image.dataset.tier;
    // A card that leaves the held band and comes back is a fresh attempt: a
    // failure that was the network's is not held against it for the session.
    delete image.dataset.dead;
    delete image.dataset.tries;
  };

  const buildArtQueue = (cap) => {
    artQueue = [];
    artRing = [];
    // The shelves read top to bottom, and the See all grid is the one being read
    // once it is open — so it joins the queue last, after the shelves behind it.
    const shelves = [
      ...[...document.querySelectorAll('.row:not(.seeall)')]
        .filter((row) => row.getBoundingClientRect().height > 5)
        .map((row) => row.querySelector('.row__track')),
      document.getElementById('see-all-grid'),
    ].filter(Boolean);
    const viewport = window.innerHeight || 1;
    const parked = [];
    // Before the page is up the loader is waiting on the leading GATE_TITLES of
    // the four gate shelves, so that is also all the pump may ask for. Held as a set here
    // rather than checked per card: the pass runs every few frames while the
    // catalogue streams in, and the gate names the same titles each time.
    const gate = revealed ? null : gateItems();
    for (const track of shelves) {
      for (const card of track.querySelectorAll('.card')) {
        const image = card.querySelector('img[data-src]');
        if (!image || image.dataset.dead) continue;
        // A slice holding a stand-in for a title the row has not reached yet
        // keeps the one picture it was painted with. It is about to take the
        // row's real last title, and every change of its art before then — a
        // half-size file upgraded, a titled one replacing the list page's — is a
        // blink in the corner of the shelf. Once the page is up its one picture
        // is asked for here rather than from the queue; before that it is left
        // alone, because it is a copy of a row's last title and the loader waits
        // on the leading titles, not on the ring's tail.
        if (card.__pin) {
          if (gate && !gate.has(card.__item)) continue;
          if (!image.getAttribute('src') && !image.dataset.dead) {
            const first = image.dataset.low || image.dataset.full;
            if (first) {
              image.dataset.tier = 'low';
              image.src = first;
              // Faded up as well, so a slice that gets its picture after the
              // shelf has appeared does not pop one in.
              fadeArtIn(image);
            }
          }
          continue;
        }
        const box = card.getBoundingClientRect();
        // A hidden row, or one past the held band: the picture goes back. This
        // is also what a closed See all grid gets — its cards are display:none,
        // so they measure zero and hand their art over on the next pass.
        // The grid keeps its band; the shelves do not, until the page is up:
        // then the loader waits on the leading GATE_TITLES of the four gate
        // shelves and nothing else. Holding every painted card — the whole
        // window of every row, plus the ring's copies — put row one's covers
        // ahead of row four's in the pump, so the page looked like it was
        // waiting on all of them. The rest are dressed in round order once it
        // is up.
        const isGate = gate ? gate.has(card.__item) : false;
        const held = track.id === 'see-all-grid'
          ? withinGrid(box)
          : (revealed ? withinHold(box) : isGate);
        if (!held) {
          if (image.getAttribute('src')) parked.push(image);
          // Out of the band the card keeps its small file on the frame: the
          // shelf is dressed before it is reached, instead of being a dark row
          // that changes into its titled covers in front of the reader. Before
          // the page is up there is no band to dress and the gate did not ask
          // for this file, so nothing is named here: a background URL is a
          // request like any other.
          if (revealed) {
            const frame = image.parentElement;
            const low = image.dataset.low || '';
            if (frame && low) frame.style.backgroundImage = `url("${low}")`;
          }
          continue;
        }
        // In the window, or waiting its turn either side of it. A card that is
        // actually looked at takes the full file; one holding its turn takes the
        // half-size one, and is upgraded the moment it reaches the window.
        const inView = box.bottom > 0 && box.top < viewport
          && box.right > 0 && box.left < window.innerWidth;
        // Only a card that is being looked at waits for its details. The picture
        // it came with is the list page's own and the one it is about to show is
        // the titled one, so painting it in the frame here and replacing it a
        // moment later is what looked like a cached image being swapped out.
        // Everything outside the window — the ten either side, the shelf below —
        // is painted as it always was, at the smaller size, where that swap
        // cannot be seen.
        if (inView && card.__item && card.__item.deferred && !card.__item.facts) {
          if (image.getAttribute('src')) parkArt(image);
          // Before the page reveals, the frame stays empty: the first thing on
          // screen is the card as it will stay. After it, a shelf that arrives
          // on a flick is a shelf of empty frames for as long as its details
          // take, which at a wide window is seconds — so the list page's own
          // picture goes on the frame, small, and the titled artwork fades in
          // over it. Nothing is ever an empty card and nothing hard-swaps.
          const frame = image.parentElement;
          const low = image.dataset.low || '';
          if (frame) {
            if (!revealed) {
              if (frame.style.backgroundImage) frame.style.backgroundImage = '';
            } else if (low && !frame.style.backgroundImage) {
              frame.style.backgroundImage = `url("${low}")`;
            }
          }
          continue;
        }
        if (inView) {
          // This card is on the screen, so this is the moment its details are
          // asked for — if it came off the catalogue without them.
          if (card.__item && card.__item.deferred && !card.__item.facts) queueDetails(card);
          if (image.dataset.tier === 'full' && image.getAttribute('src')) continue;
          if (image.getAttribute('src')) {
            // Half-size on screen: the full file replaces it, with the small
            // picture left underneath for as long as the new one takes to paint,
            // so entering the window never blanks a card.
            const previous = image.getAttribute('src');
            const next = image.dataset.full || '';
            const frame = image.parentElement;
            // The half-size request is dropped here to make room for the full one;
            // its slot goes back now, or a card upgraded mid-flight would hold a
            // place in the pump that nothing ever answers.
            artInFlight.get(image)?.();
            image.removeAttribute('src');
            // A file swapped for a bigger copy of itself is the same picture:
            // there is nothing to crossfade, and fading it would dip the card to
            // nothing for a second to show the same image again.
            const sameShot = previous && next
              && previous.replace(/\/w\d+\//, '/') === next.replace(/\/w\d+\//, '/');
            // A shelf that has appeared and is being looked at does not cut from
            // one picture to another: the list page's still gives way to the
            // titled one, and a shelf arriving after the loader has gone is
            // exactly where that happens in the open. That swap crossfades, the
            // way the leading slice's own change does.
            if (revealed && !sameShot) {
              fadeArtIn(image, previous);
            } else {
              frame.style.backgroundImage = `url("${previous}")`;
              image.addEventListener('load', () => {
                if (image.dataset.fading === '1') return;
                frame.style.backgroundImage = '';
              }, { once: true });
            }
          }
          image.dataset.tier = 'full';
          image.dataset.src = image.dataset.full || '';
          artQueue.push(image);
          continue;
        }
        // Waiting its turn. A card that has already been seen keeps the full
        // picture it has: re-fetching a third of it to save a third of it would
        // cost a swap on the way out and buy nothing anyone sees.
        if (image.dataset.tier === 'full' && image.getAttribute('src')) continue;
        // A gate card still waiting on its details has no picture worth asking
        // for yet: the list page's still is about to give way to the titled one,
        // and fetching both spends the loader's wait on a file it throws away.
        if (gate && card.__item && card.__item.deferred && !card.__item.facts) continue;
        image.dataset.src = image.dataset.low || '';
        // The picture on the card has to be the one its item names now. A card
        // whose details landed while it was off screen kept the list page's
        // still — the new file was only queued when the card had no picture at
        // all — and that is the textless cover swapping to the titled one the
        // moment it is scrolled to.
        const current = image.getAttribute('src');
        if (!current) {
          artRing.push(image);
        } else if (current !== image.dataset.src) {
          artInFlight.get(image)?.();
          image.removeAttribute('src');
          artRing.push(image);
        }
      }
    }
    // Parked after the queues are built: handing a picture back frees a slot,
    // which starts the pump, and the pump reads the queues this loop fills.
    parked.forEach(parkArt);
    // A card far below the fold hands its decoded picture back, but not its
    // look: the small file stays on the frame, so the shelf is already dressed
    // — title in the art, no caption — before it is scrolled to. It used to be
    // taken away with the big one, which is why a row only turned into its
    // titled covers in front of the reader.
    if (revealed) {
      parked.forEach((image) => {
        const frame = image.parentElement;
        const low = image.dataset.low || '';
        if (frame && low) frame.style.backgroundImage = `url("${low}")`;
      });
    }
    pumpArt(cap);
  };

  // A pass measures every card on the page and rebuilds the queue, so it runs at
  // most a few times a second however fast the page or a row is scrolling: the
  // pictures themselves keep loading in between, and nothing that is on screen
  // waits on this gate.
  const ART_PASS_MS = 150;
  let artDue = 0;

  const scheduleArt = () => {
    if (artFrame) return;
    const wait = artDue - performance.now();
    if (wait > 0) {
      artFrame = setTimeout(() => {
        artFrame = 0;
        artDue = performance.now() + ART_PASS_MS;
        buildArtQueue();
      }, wait);
      return;
    }
    artFrame = requestAnimationFrame(() => {
      artFrame = 0;
      artDue = performance.now() + ART_PASS_MS;
      buildArtQueue();
    });
  };


  // A card that leaves the hold window gives its picture back: clearing the
  // source is what tells the browser that the decoded bitmap — the part that
  // costs VRAM — is no longer wanted. The URL stays on the node, so a card that
  // comes back is asked for again out of this session's own memory.
  const releaseArt = (node) => {
    parkArt(node.firstElementChild?.firstElementChild);
  };

  // ── Details on demand ─────────────────────────────────────────────────
  // A card arrives with the picture its list page carried — a real picture,
  // just not the one with the title drawn into it — and no facts. The details
  // call that turns it into the card the shelf shows is one TMDB request, and
  // there are four hundred cards against a screen that holds thirty, so it is
  // made for the cards that actually reach the screen, in one request per
  // screenful — and asked for a little ahead of the screen, so a shelf is
  // dressed before it is scrolled to. Until it lands the card holds its frame:
  // it has a picture of its own, but it is the list page's, and painting that
  // and swapping it out a moment later is what looked like a cached image.
  const DETAILS_BATCH = 36;   // titles one request may ask about
  // Short: a fast flick replaces a whole shelf between one pass and the next, and
  // the cards that arrive on it are holding their frames until they are asked
  // for. The pass is a query and a few hundred rectangles, so it can afford to
  // run about as often as the art schedule does.
  const DETAILS_MS = 60;      // a pass gathers the screenful before it asks
  // The loader waits on the leading titles of the four gate shelves, not on
  // every card they hold: a row is fifty titles against a screen that shows ten,
  // and dressing all fifty before the first paint spends the reader's wait on
  // cards three flicks away. The last three visible shelves are held back
  // entirely, so the wait is four shelves' leading ten rather than seven.
  const GATE_TITLES = 10;
  // The shelves the loader waits on: the four rows a reader reaches first.
  const GATE_ROWS = new Set(['continue-watching', 'trending', 'popular-movies', 'popular-tv']);
  // The last three visible shelves. Their leading ten is not fetched before the
  // reveal; the ordered pass seeds it on their first turn, then grows them by
  // twenty a round like every other shelf.
  const LATE_ROWS = new Set(['top-movies', 'top-tv', 'upcoming']);
  // After the page is up the rest are dressed in the order a reader walks them:
  // the next twenty of row one, then row two, and round again.
  const PRELOAD_BATCH = 20;
  const detailQueue = [];     // cards on screen, waiting on their details
  const detailRing = [];      // the ten either side and the shelf below
  let detailBusy = false;
  let detailDue = 0;
  let detailTimer = 0;

  const detailKey = (item) => `${item.media || 'movie'}:${item.id}`;

  // A card on screen holds its frame until its details are in, and the ten
  // either side of it are painted where nobody can see the swap — so the details
  // are asked for across the whole hold window, not just the visible strip. The
  // band reaches a little further down as well: the shelf below is dressed
  // before it is scrolled to, and a fast flick never catches a bare card.
  const DETAIL_AHEAD = 1.25;   // screens below the fold asked for in advance

  // The hold window is the queue: every card in reach that is still waiting for
  // its details joins here, the ring included — no horizontal test, because the
  // ten either side of the screen are exactly what has to be pre-rendered. Read
  // off the DOM each pass rather than off an earlier list, so a row that has just
  // paged or been repainted is covered too.
  const collectVisibleDetails = () => {
    const viewport = window.innerHeight || 1;
    const top = -viewport * ART_ABOVE;
    const bottom = viewport * (1 + DETAIL_AHEAD);
    const cards = document.querySelectorAll('.row:not(.seeall) .card, #see-all-grid .card');
    // Two queues, because two things are wanted at different times: the cards on
    // the screen, which the page is waiting to show, and the ring around them,
    // which is only being pre-rendered. The screen goes in one request of its
    // own, so its answer is not held up by the forty pictures behind it.
    // Before the page is up only the leading titles of each shelf are asked
    // for; everything else waits for the ordered pass that follows the reveal.
    const gate = revealed ? null : gateItems();
    for (const card of cards) {
      const item = card.__item;
      if (!item || !item.deferred || item.facts || card.__asked) continue;
      if (gate && !gate.has(item)) continue;
      const box = card.getBoundingClientRect();
      if (box.width < 5 || box.bottom <= top || box.top >= bottom) continue;
      card.__asked = true;
      const onScreen = box.bottom > 0 && box.top < viewport
        && box.right > 0 && box.left < window.innerWidth;
      (onScreen ? detailQueue : detailRing).push(card);
    }
  };

  const queueDetails = (node, urgent = false) => {
    if (!node || node.__asked) return;
    const item = node.__item;
    if (!item || !item.deferred || item.facts) return;
    node.__asked = true;
    if (urgent) detailQueue.unshift(node);
    else detailQueue.push(node);
    scheduleDetails();
  };

  // A card that has just been given its titled artwork and its facts, repainted
  // where it stands: the picture swaps with the small one left underneath until
  // the new one paints, and the caption goes, because the art now carries the
  // title. Nothing moves.
  const refreshCard = (node) => {
    const item = node.__item;
    const media = node.firstElementChild;
    const image = media?.firstElementChild;
    if (!image) return;
    const caption = media.querySelector('.card__caption');
    // A slice holding a stand-in for a title the row has not reached yet is not
    // repainted carelessly: it would change its picture and drop its caption in
    // the open, and it is about to be replaced by the row's real last title
    // anyway. It has exactly one change of its own — the list page's still
    // giving way to the artwork with the title drawn on it, once that title's
    // details land — and it is made here, as a crossfade over the picture it
    // already has. Continue Watching is where this one is seen: its last card is
    // the card it wraps to, so it never takes a different title.
    if (node.__pin) {
      // Rows that wrap to a different title at the end of loading take it by
      // rebuilding the slice, so their held stand-in is left alone here.
      if (!node.__frozen) return;
      const next = artFor(item.still, node.__w || 275, 1);
      const previous = image.getAttribute('src');
      if (!next || !image.dataset.full || image.dataset.full === next) return;
      image.dataset.full = next;
      image.dataset.low = artFor(item.still, node.__w || 275, ART_RING_SCALE);
      delete node.__asked;
      if (!previous) return;
      if (item.titled && caption) caption.remove();
      artInFlight.get(image)?.();
      image.removeAttribute('src');
      fadeArtIn(image, previous);
      image.src = next;
      return;
    }
    if (item.titled) {
      if (caption) caption.remove();
    } else if (!caption) {
      const span = document.createElement('span');
      span.className = 'card__caption';
      span.textContent = item.title || '';
      media.insertBefore(span, media.querySelector('.card__progress'));
    }
    const was = image.dataset.full;
    nameArt(image, item, node.__w || 275);
    delete node.__asked;
    // The wording changed but not the artwork: there is no new picture to fetch,
    // and re-pointing the old one would blank the card and pull it again.
    if (image.dataset.full === was) return;
    delete image.dataset.tier;
    delete image.dataset.dead;
    delete image.dataset.tries;
    scheduleArt();
  };

  const applyDetails = (entries) => {
    const view = document.body.dataset.view;
    const current = (heroSets[view] || heroSets.home || [])[heroIndex];
    let hero = false;
    for (const entry of entries) {
      const id = String(entry.id);
      const selector = `.card[data-id="${id}"][data-media="${entry.media}"]`;
      document.querySelectorAll(selector).forEach((node) => {
        const item = node.__item;
        if (!item) return;
        // One item can stand in more than one slot — the ring repeats the last
        // titles — and those cards share it, so the second one is already
        // dressed by the time it is reached. It still has to be repainted: its
        // picture is the list page's and its caption is still on, and skipping
        // it left exactly one copy swapping to the titled artwork after the
        // shelf had already appeared.
        if (!item.facts) {
          item.facts = entry.facts || {};
          item.dressed = true;
          if (entry.still) {
            item.still = entry.still;
            item.titled = !!entry.titled;
          }
          delete item.deferred;
        }
        refreshCard(node);
      });
      // The billboard for this title, if it is the slide on screen, wants the
      // same lookup's textless backdrop and logo.
      const slide = heroTitles[id];
      if (slide) {
        if (entry.hero) slide.image = entry.hero;
        if (entry.logo) slide.logo = entry.logo;
        if (entry.facts) {
          slide.facts = entry.facts;
          if (entry.facts.trailer) slide.trailer = entry.facts.trailer;
        }
        if (id === current) hero = true;
      }
      if (hoverPending && hoverPending.dataset.id === id) {
        const card = hoverPending;
        hoverPending = null;
        if (card.isConnected && card.matches(':hover')) showPreview(card);
      }
    }
    if (hero && revealed) renderHero(heroIndex);
  };

  const requestDetails = (keys, targets = []) => new Promise((done) => {
    if (!keys.length || !window.catalogue) {
      done(false);
      return;
    }
    const asked = keys.map((key) => {
      const [media, id] = key.split(':');
      return { media, id: Number(id) };
    });
    window.catalogue.details(asked)
      .then((dressed) => (dressed.length ? dressed : null))
      .then((items) => {
        if (items) {
          applyDetails(items);
          // Titles asked for before their card exists — a row settling onto its
          // real last one — are patched on the row's own items, so the card is
          // built already dressed instead of waiting for another pass.
          const byKey = new Map(items.map((entry) => [detailKey(entry), entry]));
          for (const item of targets) {
            const entry = byKey.get(detailKey(item));
            if (!entry) continue;
            item.facts = entry.facts || {};
            if (entry.still) {
              item.still = entry.still;
              item.titled = !!entry.titled;
            }
            delete item.deferred;
          }
          done(true);
          return;
        }
        releaseWaiting(keys);
        done(false);
      })
      .catch(() => {
        releaseWaiting(keys);
        done(false);
      });
  });

  // The details did not come: those cards take the list page's own picture
  // rather than standing dark, and keep it — a second ask would fail the same
  // way. It is also what lets the page reveal if it is waiting on them.
  const releaseWaiting = (keys) => {
    for (const key of keys) {
      const [media, id] = key.split(':');
      document.querySelectorAll(`.card[data-id="${id}"][data-media="${media}"]`)
        .forEach((node) => {
          if (node.__item && !node.__item.facts) node.__item.deferred = false;
        });
    }
    scheduleArt();
  };

  // The titles the first paint waits on: the leading GATE_TITLES of the four
  // gate shelves, in shelf order.
  const gateItems = () => {
    const items = new Set();
    document.querySelectorAll('.row:not(.seeall)').forEach((row) => {
      // Only the four shelves the loader waits on. The last three were not
      // seeded before the reveal, so there is nothing on them to wait for.
      if (!GATE_ROWS.has(row.dataset.section)) return;
      (rowItems.get(row.dataset.section) || []).slice(0, GATE_TITLES)
        .forEach((item) => items.add(item));
    });
    return items;
  };
  const gateCards = () => {
    const items = gateItems();
    return [...document.querySelectorAll('.row:not(.seeall) .card')]
      .filter((card) => items.has(card.__item));
  };

  // The loader's own pass: the leading titles of the four gate shelves, and
  // nothing else. The rest of the catalogue — including the last three shelves'
  // entire first ten — is dressed after the reveal, in row order, so the wait
  // before the first paint is four shelves' leading covers rather than seven.
  const dressShelves = () => {
    if (revealed) return;
    const gate = gateItems();
    let added = false;
    for (const card of document.querySelectorAll('.row:not(.seeall) .card')) {
      const item = card.__item;
      if (!item || !item.deferred || item.facts || card.__asked) continue;
      if (!gate.has(item)) continue;
      // The ring, not the screen's own queue: a card the reader has just
      // scrolled to still goes first, and the shelves below are dressed in the
      // quiet between one screenful and the next.
      card.__asked = true;
      detailRing.push(card);
      added = true;
    }
    if (added) scheduleDetails();
  };

  // One request for the screenful, then the next one: the chain ends when the
  // screen has nothing left without its details, so it cannot keep asking.
  const flushDetails = () => {
    detailTimer = 0;
    if (detailBusy) return;
    collectVisibleDetails();
    dressShelves();
    // The ring waits for the page to be up. Its forty lookups and forty pictures
    // would otherwise be running against the screen's own while the loader is
    // still waiting on them, and the first paint is the thing this is for.
    const pending = detailQueue.length ? detailQueue : detailRing;
    if (!pending) return;
    const keys = [];
    const seen = new Set();
    while (pending.length && keys.length < DETAILS_BATCH) {
      const node = pending.shift();
      if (!node.isConnected) continue;
      const item = node.__item;
      if (!item || item.facts || !item.deferred) continue;
      const key = detailKey(item);
      // The same title can be painted twice, in a row and in See all: one lookup
      // answers for both, and the merge repaints every card carrying that id.
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    if (!keys.length) return;
    detailBusy = true;
    requestDetails(keys).finally(() => {
      detailBusy = false;
      flushDetails();
    });
  };

  // The details for a named set of titles, merged when they arrive (or released
  // to their list artwork if they do not). The screen's queue uses this, and so
  // does a row settling onto its real last title.
  const warmDetails = (list) => {
    const items = list.filter((item) => item && item.deferred && !item.facts);
    const keys = [...new Set(items.map(detailKey))];
    return requestDetails(keys.slice(0, DETAILS_BATCH), items.slice(0, DETAILS_BATCH));
  };

  const scheduleDetails = () => {
    if (detailTimer || detailBusy) return;
    const wait = Math.max(0, detailDue - performance.now());
    detailTimer = setTimeout(() => {
      detailDue = performance.now() + DETAILS_MS;
      flushDetails();
    }, wait);
  };

  // ── After the first paint ────────────────────────────────────────────────
  // The loader waited on the leading GATE_TITLES of the four gate shelves. Now
  // the rest are dressed in the order a reader would walk them: the last three
  // shelves seed their first ten, and every shelf's next PRELOAD_BATCH follows,
  // row one then row two down the page, then the batch after that on row one
  // again — so every shelf's near titles are ready before any shelf's far ones,
  // and a horizontal scroll never meets a caption where a cover belongs.
  const preloadStep = (plan, done) => {
    while (plan.length) {
      const chunk = plan[0].filter((item) => item && item.deferred && !item.facts);
      if (!chunk.length) {
        plan.shift();
        continue;
      }
      const keys = [...new Set(chunk.map(detailKey))];
      // One batch at a time: the order is the point, so a row's next twenty is
      // answered before the row after it is asked about.
      requestDetails(keys, chunk).finally(() => {
        plan.shift();
        scheduleArt();
        // Off the promise, onto the loop: an answer should not hold the next
        // row's request in a stack nothing else can use.
        setTimeout(() => preloadStep(plan, done), 0);
      });
      return;
    }
    done?.();
  };

  const startPreload = (done) => {
    const rows = [...document.querySelectorAll('.row:not(.seeall)')];
    const lists = rows.map((row) => (rowItems.get(row.dataset.section) || []).slice(GATE_TITLES));
    const plan = [];
    for (let round = 0; ; round += 1) {
      let any = false;
      for (const items of lists) {
        const chunk = items.slice(round * PRELOAD_BATCH, (round + 1) * PRELOAD_BATCH);
        if (!chunk.length) continue;
        any = true;
        plan.push(chunk);
      }
      if (!any) break;
    }
    preloadStep(plan, done);
  };

  const settleLate = () => {
    [...lateSettles.values()].forEach((settle) => settle());
    lateSettles.clear();
  };

  // The catalogue's second half. The four gate shelves were seeded with their
  // leading ten titles before the page went up; the last three visible shelves
  // seed theirs here, on their own turn in the first round. From then on every
  // shelf is read the same way: one row's next twenty at a time, in the order a
  // reader walks them, each batch dressed before the next row is asked for. The
  // loader is already gone, so this is preload, not first paint: no card is
  // waiting on it, and the shelves grow behind the page.
  const startGrowth = (done) => {
    if (growthStarted) return;
    if (!catalogueMore) {
      // No controller is a catalogue that failed, or one the guard lifted the
      // page ahead of. Dress whatever rows did stage; a controller that arrives
      // later still starts the growth it was meant to.
      startPreload(done);
      return;
    }
    growthStarted = true;
    const names = [...document.querySelectorAll('.row:not(.seeall)')]
      .map((row) => row.dataset.section)
      .filter((name) => name && name !== 'continue-watching');
    let round = 0;
    const step = () => {
      round += 1;
      let grew = false;
      const chain = names.reduce((promise, name) => promise.then(async () => {
        // A held-back shelf seeds its leading ten on its first turn; every
        // shelf, including the held-back ones after that, grows twenty a round.
        const count = round === 1 && LATE_ROWS.has(name) ? GATE_TITLES : PRELOAD_BATCH;
        const added = await catalogueMore.growRow(name, count);
        if (added && added.length) {
          grew = true;
          // Details first, the append second: by the time a card from this batch
          // is painted it already names its titled cover, so no part of the row
          // is ever a textless still that swaps in the open.
          await warmDetails(added);
          acceptLine({ sections: { [name]: added }, append: true, partial: true });
          scheduleArt();
        }
        // A gate shelf is whole after its second batch (ten + twenty + twenty
        // is the fifty it holds); a held-back one needs a third, because its ten
        // arrived after the reveal. A shelf whose list has nothing more to give
        // is done whenever that happens. Its leading slice can take the real
        // last title now, rather than waiting for every other shelf to finish.
        const whole = round >= (LATE_ROWS.has(name) ? 3 : 2);
        if ((whole || !added || !added.length) && lateSettles.has(name)) {
          lateSettles.get(name)();
          lateSettles.delete(name);
        }
      }), Promise.resolve());
      chain.then(() => {
        if (grew && round < 8) step();
        else done?.();
      }).catch(() => done?.());
    };
    step();
  };

  // A picture arriving on a shelf that is standing still — held at zero until
  // its art has decoded, with the picture it is replacing kept underneath, then
  // faded up rather than popped. Used twice: the leading slice painting its
  // stand-in for the first time, and that slice taking the row's real last title
  // when the catalogue finishes. Both are the only change that card makes, so
  // both are made as a crossfade and never as a swap.
  const ART_FADE_MS = 1000;
  const fadeArtIn = (image, under = '') => {
    if (!image) return;
    const frame = image.parentElement;
    // The picture being replaced stays under the new one for as long as it takes
    // to decode, so the slice never blinks dark in between.
    if (frame) image.dataset.fading = '1';
    if (under && frame) frame.style.backgroundImage = `url("${under}")`;
    image.classList.add('is-arriving');
    let shown = false;
    const show = () => {
      if (shown || !image.isConnected) return;
      shown = true;
      // Read the box with the picture at zero first: the arriving class and the
      // ready one applied in the same frame are one style change, and a style
      // change is not a transition — the new art would appear instantly, which
      // is the flash this fade exists to avoid.
      void image.offsetWidth;
      image.classList.add('is-ready');
      setTimeout(() => {
        image.classList.remove('is-arriving', 'is-ready');
        delete image.dataset.fading;
        if (under && frame) frame.style.backgroundImage = '';
      }, ART_FADE_MS + 400);
    };
    if (image.complete && image.naturalWidth) {
      requestAnimationFrame(show);
      return;
    }
    image.addEventListener('load', show, { once: true });
    // Never leave the card blank if that artwork does not come.
    setTimeout(show, 2500);
  };

  // One card, from one item. Shared by the rows and the See all grid: the hover
  // panel reads `__item` off the node, so a card carries its own data wherever
  // it is painted. `cssWidth` is the slot the picture lands in, so the artwork
  // is fetched at that size and at that size only. `rank` is the card's place in
  // its row, printed in the corner: twenty cards behind one glass arrow are hard
  // to keep track of, and the number is the cheapest way to know where you are.
  const buildCard = (item, cssWidth = 275, rank = 0) => {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.__item = item;
    node.__rank = rank;
    // The slot the picture lands in, kept so a card whose details arrive later
    // asks for its new artwork at the same size as the one it is replacing.
    node.__w = cssWidth;
    node.dataset.id = item.id ?? '';
    node.dataset.media = item.media ?? 'movie';
    const media = node.firstElementChild;
    const image = media.firstElementChild;
    image.alt = item.title || '';
    // The files are named here but asked for by the schedule, in reading order.
    nameArt(image, item, cssWidth);
    if (rank) {
      const badge = document.createElement('span');
      badge.className = 'card__rank';
      badge.textContent = String(rank);
      badge.setAttribute('aria-hidden', 'true');
      media.append(badge);
    }
    // The picture usually carries the title. When it does not — textless
    // artwork, or a title TMDB has none for — the title is stamped into the
    // card's bottom-left corner instead of being lost.
    if (!item.titled) {
      const caption = document.createElement('span');
      caption.className = 'card__caption';
      caption.textContent = item.title || '';
      media.append(caption);
    }
    if (item.progress) {
      const bar = document.createElement('span');
      bar.className = 'card__progress';
      const fill = document.createElement('span');
      fill.style.width = `${Math.round(item.progress * 100)}%`;
      bar.append(fill);
      media.append(bar);
    }
    return node;
  };

  // ── Row paging ────────────────────────────────────────────────────────
  // Each track is a scroll container: cards sit at their 275px floor and the
  // ones past the window edge wait behind the glass arrows. A click moves a
  // whole page of cards, never a single one. All of this runs off the one
  // /api/catalog payload, so scrolling a row costs no further requests.
  const rowModels = new Map();
  // What each row holds, in order: the loader names its leading titles from
  // here, and the pass after the first paint walks the rest row by row.
  const rowItems = new Map();

  // The shelves as one set: parked when nothing is showing them, woken in the
  // order the reader comes back to them. Parking starts below the first screen —
  // coming out of the grid puts the reader at the top of the page, and a shelf
  // they can already see must not be rebuilt just to be seen again.
  const parkRowsBelow = () => {
    const vh = window.innerHeight || 0;
    const at = window.scrollY || 0;
    rowModels.forEach((model, row) => {
      const box = row.getBoundingClientRect();
      // Measured against the page, not the window: the grid opens at the top, so
      // the shelf that has to stay is the one the top of the page shows.
      if (box.height > 0 && box.top + at > vh) model.park();
    });
  };
  const wakeRows = () => {
    if (document.body.classList.contains('is-seeing-all')) return;
    rowModels.forEach((model) => model.wake());
  };
  const wakeRowsNearby = () => {
    // Nothing to wake towards while the grid is the page: the shelves under it
    // are parked on purpose, and the scroll an open makes is not the reader
    // coming back to them.
    if (document.body.classList.contains('is-seeing-all')) return;
    const vh = window.innerHeight || 0;
    rowModels.forEach((model, row) => {
      if (!model.parked()) return;
      const box = row.getBoundingClientRect();
      if (box.bottom > -vh && box.top < 2 * vh) model.wake();
    });
  };
  // A parked shelf that a scroll brings back is rebuilt as it arrives, not
  // after it: one look per frame, and only at rows that are still parked.
  let wakeFrame = 0;
  window.addEventListener('scroll', () => {
    if (wakeFrame) return;
    wakeFrame = requestAnimationFrame(() => {
      wakeFrame = 0;
      wakeRowsNearby();
    });
  }, { passive: true });
  // Nothing on a hidden tab is being painted, so nothing there needs a picture.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) parkRowsBelow();
    else if (!document.body.classList.contains('is-seeing-all')) wakeRowsNearby();
  });

  const setupRow = (row) => {
    const track = row.querySelector('.row__track');
    const prev = row.querySelector('.row__prev');
    const next = row.querySelector('.row__next');
    if (!track || !prev || !next) return;

    // ── Windowed list ──────────────────────────────────────────────────
    // Only the cards inside the viewport (plus a small overscan each side)
    // exist in the DOM; a spacer at each end stands in for the rest of the
    // strip, so scroll width, height and the trailing gutter are unchanged.
    // This is the "visible range" model an iced Row would run: node count,
    // decode work and memory stay proportional to the window, not the list.
    track.classList.add('is-virtual');

    const MIN_CARD = 275;   // token: the narrowest a card may paint
    // Six cards either side of what is on screen are held, and nothing further:
    // a card and a half of runway past one pager step, which is more than a
    // flick can outrun between two art passes. The pictures are where the
    // memory goes, so the window is kept to what a scroll can actually reach —
    // ten either side kept thirty pictures a shelf that nothing was going to
    // show, and every one of them was a decoded bitmap.
    const HOLD = 6;
    // Continue Watching is the one row whose last card *is* the card it wraps
    // to, so its leading slice never takes a different title when the row
    // settles. Its one change of picture is the list page's still giving way to
    // the artwork with the title on it, and that is a crossfade (see
    // `refreshCard`). At a window wide enough for its ten cards there is no wrap
    // card at all, so there is nothing there to change.

    let items = [];
    let nodes = new Map();  // index -> element, for the painted window only
    let cardW = MIN_CARD;
    let stride = MIN_CARD;  // card width + gap
    let total = 0;          // full strip width, copies included
    let cloneRun = 0;       // copies of the row laid out before and after it
    let slotCount = 0;      // cards in the strip: the row plus those copies
    let base = 0;           // scroll position where the first item leads
    let seeded = false;     // whether the strip has been placed at `base`
    let winStart = -1;
    let winEnd = -2;
    // The slice before the row carries the card that wraps round from its end —
    // which makes it the one card that changes title every time the row grows,
    // on screen. It is held on the title it first showed (`pinned`) until the
    // catalogue says the row is whole (`settled`), then swaps to the real last
    // title once, fading it in.
    let settled = false;
    // Slot -> the title that copy held when it was first painted. Keyed by slot
    // because every copy before the row wraps round from its end separately.
    const pinnedAt = new Map();
    // What each of those slices was showing when the row settled: the picture
    // stays under the one taking its place, for the length of a decode.
    let settleFrom = new Map();
    let fading = false;
    let viewportW = 0;      // cached: reading clientWidth in a scroll handler
    let observedW = -1;     // would force a style+layout recalc per event
    // A wheel gesture arrives as a stream of events, each ending its own
    // instant scroll. Settling between them would snap the strip back under
    // the pointer, so the last wheel, like a pull, defers the snap to the end
    // of the gesture.
    let wheelQuietUntil = 0;

    // Cached: this is read by `paint`, which runs once per frame of a scroll, and
    // a computed-style read per frame is a forced style pass waiting to happen.
    // Only a layout can change it, and that clears the cache.
    let gapCache = 0;
    const gap = () => gapCache || (gapCache = parseFloat(getComputedStyle(track).columnGap) || 0);
    // A row longer than one window is the only kind that moves; a ring has no
    // end, so that length is the only question left to ask of the geometry.
    const runs = () => items.length * stride > viewportW + 1;

    const spacers = [document.createElement('div'), document.createElement('div')];
    spacers.forEach((el) => { el.className = 'row__gap'; el.setAttribute('aria-hidden', 'true'); });

    // Geometry. A shelf is a whole number of cards plus one deliberate sliver:
    // m cards and PEEK pixels of the next one, ending exactly on the window's
    // edge. The count follows the window and the width takes what is left over,
    // which is what makes the slice the same width everywhere — the window's own
    // edge used to cut whatever fell there, 0 to 290px of a card depending on
    // the width. Short rows keep the plain 275px card and stretch nothing, so
    // Continue Watching still lines up with the shelves under it. The slate is
    // wide enough to read as a card waiting there, and the pager over it is
    // sized just inside it (see `.row__prev`), so the arrow never hangs off the
    // slice it is drawn on.
    const PEEK = 60;

    const layout = (snap = true) => {
      gapCache = 0;
      viewportW = track.clientWidth;
      observedW = viewportW;
      const viewport = viewportW;
      const g = gap();
      const n = items.length;
      if (!viewport || !n) return;
      // Which card leads right now, in the geometry being replaced, so a resize
      // keeps the row where it was instead of parking it a fraction of a card
      // off a rest slot.
      const keep = seeded && stride ? nearestIndex(track.scrollLeft) : -1;
      // The card width that leaves exactly PEEK showing at each end of the row:
      // a slice, a gap, the whole cards, a gap, a slice. The left slice needs
      // its own budget even though a row at rest has nothing before its first
      // card — that unspent 40px is why a rest row's single slice reads wider
      // than either slice after it has moved.
      const widthFor = (count) => (viewport - 2 * PEEK - (count + 1) * g) / count;
      // The width depends on the window, not on how many items a row has, so
      // every shelf is made of the same card: a short row simply ends early
      // instead of painting bigger cards than the rows under it.
      let best = 1;
      let bestCost = Infinity;
      for (let count = 1; count <= 12; count += 1) {
        const w = widthFor(count);
        // Nearest the token size wins; a card far below it is never worth it.
        const cost = Math.abs(w - MIN_CARD) + (w < 200 ? 1000 : 0);
        if (cost < bestCost) { bestCost = cost; best = count; }
      }
      cardW = Math.max(1, Math.round(widthFor(best)));
      stride = cardW + g;
      // A row longer than one window is a ring: its last card sits before its
      // first and its first after its last, so the leading peek has a card to
      // show even before anything has been scrolled and the strip has no end to
      // stop at. Enough copies are laid out either side to hold a whole window.
      // A row that fits whole is left alone — copies of it would just repeat
      // what is already on screen.
      const scrolls = n * cardW + (n - 1) * g > viewport;
      cloneRun = scrolls ? Math.ceil(viewport / stride) + 2 : 0;
      slotCount = n + cloneRun * 2;
      total = slotCount * cardW + (slotCount - 1) * g;
      base = cloneRun ? cloneRun * stride - (PEEK + g) : 0;
      track.style.setProperty('--card-w', `${cardW}px`);
      // Each pager is the handle for the slice of the neighbouring card the row
      // leaves showing, so it is told how wide that slice really is. It is PEEK
      // only while the cards divide the window evenly — `cardW` is rounded to
      // whole pixels, and the few px that leaves over land in the trailing
      // slice, moving with the window's width and the display's pixel ratio. A
      // pager on a fixed width therefore ended a step inside (or past) the card
      // it sits on, depending on the window. The rect is used rather than the
      // rounded `clientWidth` so the trailing edge lands on the card's own edge.
      const frame = track.parentElement;
      if (frame) {
        const tail = (track.getBoundingClientRect().width || viewport) - (PEEK + best * stride + g);
        frame.style.setProperty('--peek-lead', `${PEEK}px`);
        frame.style.setProperty('--peek-tail', `${Math.min(cardW, Math.max(24, tail)).toFixed(2)}px`);
      }
      // Start one lap in, so the first paint already has the last card's tail
      // in the leading peek.
      seeded = true;
      if (snap || keep < 0) {
        const target = keep < 0 ? base : restAt(keep);
        track.scrollTo({ left: target, behavior: 'instant' });
        paint(true);
        // The strip is only as long as the spacers currently make it, and those
        // are rebuilt by `paint` for the window it decides to hold. A scroll set
        // on a strip that is still one short window long is clamped to its end —
        // which parked a freshly filled row on its last cards, number 13 first,
        // instead of on number 1 — so the offset is applied again now that paint
        // has given the strip its full length, and the window is rebuilt around
        // the place the row actually came to rest.
        if (Math.abs(track.scrollLeft - target) > 1) {
          track.scrollTo({ left: target, behavior: 'instant' });
          paint(true);
        }
      } else {
        // A row that grew keeps the place it was scrolled to. The card width,
        // the ring and the base are all independent of how many items a row
        // holds, so ten more items need no reposition at all — snapping to a
        // card edge here is what made a shelf jump under the pointer and repaint
        // every card it was showing, once per chunk that streamed in.
        paint(true);
      }
      sync();
    };

    // Reconcile the DOM against the visible range. Paint runs on scroll, so it
    // must be cheap when the window has not moved.
    const paint = (force) => {
      const n = items.length;
      const viewport = viewportW;
      if (!n || !viewport) return;
      const g = gap();
      const start = Math.max(0, Math.floor(track.scrollLeft / stride) - HOLD);
      const lastVisible = Math.floor((track.scrollLeft + viewport - 1) / stride);
      const stop = Math.min(slotCount - 1, lastVisible + HOLD);
      if (!force && start === winStart && stop === winEnd) return;

      const painted = [];
      for (let slot = start; slot <= stop; slot += 1) {
        // Wrap into the row: the copies either side carry its real items.
        const ahead = slot - cloneRun;
        let place = ((ahead % n) + n) % n;
        // A slice before the row holds its stand-in until the row is whole (see
        // `pinnedAt`): it is a placeholder for a title that has not arrived, so
        // it keeps the picture it was painted with instead of repainting itself
        // when that title's details land.
        const pinned = !settled && ahead < 0;
        // Continue Watching's slice is the one card that has nothing to change to
        // when the row settles, and its title's details only arrive with that
        // settle — so re-pointing it there would repaint the card a few seconds
        // after it faded in. It keeps the picture it faded in with instead.
        const frozen = ahead < 0 && row.dataset.section === 'continue-watching'
          && (pinned || settled);
        // Hold the copies before the row still while the row is still growing.
        if (pinned) {
          if (!pinnedAt.has(slot)) pinnedAt.set(slot, place);
          place = pinnedAt.get(slot) % n;
        }
        const wanted = items[place];
        let node = nodes.get(slot);
        // `cloneRun` places the row inside the ring, and it changes with the
        // window width — so a resize shifts which title every slot holds. A
        // node that no longer carries this slot's title is thrown away instead
        // of being kept: left in place it paints its old title in its old slot
        // *and* the slot that title just moved to, which is how one resize put
        // the same card twice at the head of every row.
        if (node && node.__item !== wanted) {
          node.remove();
          nodes.delete(slot);
          node = null;
        }
        if (!node) {
          node = buildCard(wanted, cardW, place + 1);
          node.__pin = pinned || frozen;
          node.__frozen = frozen;
          // The row is whole: the slice takes its real last title, and the
          // picture fades up rather than popping into a shelf at rest.
          if (fading && ahead < 0) fadeArtIn(node.firstElementChild?.firstElementChild, settleFrom.get(slot));
          nodes.set(slot, node);
          // A card this paint just built has never been seen, and on a fast
          // flick the window moves faster than the art pass runs — so its
          // picture goes into the queue now rather than at the next pass. A
          // card waiting on its details still holds its frame: that is the one
          // case where nothing is painted yet on purpose.
          const fresh = node.firstElementChild?.firstElementChild;
          if (fresh && !fresh.getAttribute('src') && !fresh.dataset.dead) {
            const box = node.getBoundingClientRect();
            const onScreen = box.bottom > 0 && box.top < innerHeight
              && box.right > 0 && box.left < window.innerWidth;
            if (!(onScreen && wanted && wanted.deferred && !wanted.facts)) {
              // The slice before a row is on screen by construction, even when the
              // row has not been placed yet and its card measures off to the side:
              // asking for the half-size file there and upgrading it later is a
              // second change to a card that is meant to change once.
              const seen = onScreen || ahead < 0;
              fresh.dataset.tier = seen ? 'full' : 'low';
              fresh.dataset.src = seen ? (fresh.dataset.full || '') : (fresh.dataset.low || '');
              (onScreen ? artQueue : artRing).push(fresh);
              // The whole screenful's worth at once: a flick has just emptied a
              // shelf and the idle batch of eight would take four waves to fill
              // it, at a frame or two each.
              pumpArt(ART_SCREEN);
            }
          }
        } else {
          node.__pin = pinned || frozen;
          node.__frozen = frozen;
          // A resize changed the card width: re-ask at the new size, and only
          // then — the comparison keeps an unchanged card from touching its
          // src (and so from re-requesting anything). A slice holding a stand-in
          // is left alone entirely: it is replaced when the row settles.
          const image = node.__pin ? null : node.firstElementChild.firstElementChild;
          if (image) {
            const tier = image.dataset.tier;
            nameArt(image, node.__item, cardW);
            // The size it was showing stays the size it shows: a card on screen
            // takes the new full file, one waiting its turn the new half-size
            // one.
            const next = tier === 'low' ? image.dataset.low : image.dataset.full;
            if (next) {
              image.dataset.src = next;
              // A picture already on screen is swapped in place; one still
              // waiting its turn just carries the new name. A card that is being
              // looked at and is changing *file* — the list page's still giving
              // way to the titled one — crossfades instead of cutting: this is
              // the path a row keeps when it is being re-measured at the moment
              // its details land, and a cut there is a flash across the row.
              const previous = image.getAttribute('src');
              if (previous && previous !== next && revealed) fadeArtIn(image, previous);
              if (previous) image.src = next;
            }
          }
        }
        painted.push(node);
      }
      nodes.forEach((node, index) => {
        if (index < start || index > stop) {
          // Out of the hold window: the picture goes with the card.
          releaseArt(node);
          node.remove();
          nodes.delete(index);
        }
      });

      // Spacer widths include the flex gap each one replaces, so the first card
      // lands exactly on `start * stride` and the last keeps the strip's length.
      const before = start * stride - g;
      const after = (slotCount - 1 - stop) * stride - g;
      spacers[0].hidden = before <= 0;
      spacers[0].style.width = before > 0 ? `${before}px` : '0px';
      spacers[1].hidden = after <= 0;
      spacers[1].style.width = after > 0 ? `${after}px` : '0px';

      // Only the cards that changed hands are touched: rebuilding the whole
      // child list would invalidate the track's layout and drop compositor
      // state on every frame of a fast scroll. The spacers keep the strip's
      // width, so the visible cards never move as the window slides.
      if (spacers[0].parentNode !== track) {
        track.replaceChildren(spacers[0], ...painted, spacers[1]);
      } else {
        let cursor = spacers[0].nextSibling;
        painted.forEach((node) => {
          if (node === cursor) {
            cursor = cursor.nextSibling;
            return;
          }
          track.insertBefore(node, cursor);
        });
        while (cursor && cursor !== spacers[1]) {
          const stale = cursor;
          cursor = cursor.nextSibling;
          stale.remove();
        }
        if (!track.contains(spacers[1])) track.append(spacers[1]);
      }
      winStart = start;
      winEnd = stop;
      // Whatever the window brought in is asked for now, on screen first —
      // picture and details both.
      scheduleArt();
      scheduleDetails();
    };

    // The rest position of item `index`: its card edge pulled back by one peek,
    // so the tail of the card before it stays in view — at index 0 that is the
    // row's own last card, because the strip wraps.
    const restAt = (index) => base + index * stride;

    const nearestIndex = (left) => {
      const n = items.length;
      const guess = Math.round((left - base) / stride);
      return ((guess % n) + n) % n;
    };

    // One page = as many whole cards as fit, so a click moves a screenful and
    // still ends on a card edge rather than mid-card.
    const perPage = () => {
      if (!stride) return 1;
      return Math.max(1, Math.floor((viewportW + gap()) / stride));
    };

    const sync = () => {
      // A ring always has somewhere to go, so both arrows stay available for as
      // long as the row is longer than the window.
      const moving = runs();
      prev.classList.toggle('is-available', moving);
      next.classList.toggle('is-available', moving);
      prev.disabled = !moving;
      next.disabled = !moving;
    };

    // When the pager's own walk is in flight. Its last scrollend arrives while the
    // walk it belongs to is already over, and the settle that follows would snap
    // the strip back to the edge the step started from — one click that does
    // nothing and the next covering both pages.
    let walkingUntil = 0;

    // `aim` is the item a running animation is heading for, so quick repeated
    // clicks page from where the last click was going instead of from a
    // half-finished scroll position.
    let aim = null;

    // A lap of the ring is a jump nobody can see: the strip repeats every lap,
    // so whenever a target would fall outside the scrollable strip, the strip
    // takes a lap along with it and the target stays put on screen. This is what
    // lets a page run past the first card or the last without ever stopping.
    // How far the strip can actually scroll, read from the layout rather than
    // worked out from the slot arithmetic. The spacers are rebuilt by `paint`
    // for the window it chooses to hold, so the strip is not always the whole
    // ring's length, and a target past its real end is clamped by the browser
    // without saying so — a few pixels of error there is a drag that jams at the
    // seam and will not budge until the gesture is over.
    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const lapShift = (left, cap = maxScroll()) => {
      const span = items.length * stride;
      if (!span) return 0;
      if (left < 0) return span * Math.ceil(-left / span);
      if (left > cap) return -span * Math.ceil((left - cap) / span);
      return 0;
    };

    // A lap and an eased scroll cannot go in the same frame: the browser starts
    // the animation from the offset it had before the jump, so the row glides
    // the whole lap backwards instead of carrying on the way it was going. The
    // jump is committed first, then the walk starts from where it landed.
    // A lap is exactly one row length, so the cards already painted simply move
    // to new slot numbers: the same item sits there, because the ring's mapping
    // wraps at the row's length. Re-key the window to follow them instead of
    // throwing every card away and asking for its picture again — that rebuild is
    // what flashed a whole row on each lap.
    const rekey = (shift) => {
      const slots = stride ? Math.round(shift / stride) : 0;
      if (!slots) return;
      const rekeyed = new Map();
      nodes.forEach((node, slot) => rekeyed.set(slot + slots, node));
      nodes.clear();
      rekeyed.forEach((node, slot) => nodes.set(slot, node));
      const pins = [...pinnedAt];
      pinnedAt.clear();
      pins.forEach(([slot, place]) => pinnedAt.set(slot + slots, place));
      if (winStart >= 0) {
        winStart += slots;
        winEnd += slots;
      }
    };

    // Take a lap and land on `to`. Always instant: the strip's own scrolling is
    // eased, and an eased lap plays as the row sliding a whole lap the wrong way.
    // Twice, because the spacers only describe the strip as it was — the first
    // write can be clamped short of the mark, and the paint after it is what gives
    // the strip the length the second write needs.
    const lapTo = (shift, to) => {
      rekey(shift);
      const at = Math.max(0, Math.min(maxScroll(), to));
      track.scrollTo({ left: at, behavior: 'instant' });
      paint(true);
      track.scrollTo({ left: at, behavior: 'instant' });
      paint(true);
      return at;
    };

    // Put the strip at `to`, taking a lap first when `to` falls outside it. The
    // ring repeats every lap, so the lap is invisible and `to` stays put on
    // screen. Returns where a caller should aim: `to`, shifted by the lap.
    const arrive = (to, behavior = 'instant') => {
      const shift = lapShift(to);
      const goal = to + shift;
      // The lap lands where the strip already was, one lap along — never on the
      // target. Landing on it left the eased walk with no distance to travel, so
      // exactly those steps that needed a lap arrived instantly while every other
      // one glided: a pager walked in one direction skipped its animation once a
      // lap, at the same place each time round.
      if (shift) lapTo(shift, track.scrollLeft + shift);
      if (behavior === 'instant') {
        track.scrollTo({ left: Math.max(0, Math.min(maxScroll(), goal)), behavior: 'instant' });
        return goal;
      }
      // The walk starts after the jump is committed, or the browser begins the
      // animation from the offset it had before it.
      // A walk the row is making for itself: the settle that follows the last
      // scrollend must not run over it (see `settle`).
      walkingUntil = performance.now() + 900;
      requestAnimationFrame(() => track.scrollTo({ left: goal, behavior }));
      return goal;
    };

    const page = (direction) => {
      const n = items.length;
      if (!n || !stride) return;
      stopGlide();
      const step = perPage();
      // Absolute slot arithmetic, so a row that has already been round the ring
      // a few times still steps from where it actually is.
      const from = aim !== null ? aim : Math.round((track.scrollLeft - base) / stride);
      const to = from + direction * step;
      const raw = base + to * stride;
      // Take the lap first, then walk the rest: the jump is invisible, and the
      // walk then travels the way the arrow points instead of sweeping back
      // across the row.
      aim = to;
      arrive(raw, 'smooth');
    };

    // ── Fling ────────────────────────────────────────────────────────────
    // A pull that is released while still moving carries on and eases out, so a
    // quick swipe crosses more than a slow one of the same distance. The pointer
    // driver measures the swipe over the last stretch of the drag only (a long
    // slow pull that ends in a flick is a flick), and the speed is spent over a
    // fixed window: faster release, further travel, in the direction the strip
    // was already going.
    const FLING_MIN = 0.35;   // px/ms below which a release is just a release
    const FLING_MS = 260;     // how long the release speed is carried for
    const FLING_MAX = 3200;   // px, so no swipe can fly across the whole row
    let glideFrame = 0;
    let gliding = false;

    // The wheel's own movement: a mark the notches move, and a loop that eases the
    // strip toward it. A notch used to start a native smooth scroll, and the next
    // notch cancelled it and started another from a standstill — a wheel turned
    // faster than one animation lasted therefore stuttered once per notch. Here a
    // notch only moves the mark, and the single loop keeps whatever speed it has,
    // so a dozen notches a second are one continuous movement instead of a dozen.
    let stepMark = null;
    let stepFrame = 0;
    let stepBehaviour = '';
    // The loop's own speed, in pixels a frame. It is smoothed rather than set from
    // the gap each frame: a gap eased straight down reaches nothing before the next
    // notch and is thrown forward again, which is the wheel moving in bursts.
    // Pixels a frame at most: a wheel spun hard should not outrun the eye.
    const MAX_STEP = 130;

    const stopStep = (finish) => {
      if (stepFrame) cancelAnimationFrame(stepFrame);
      stepFrame = 0;
      if (stepMark === null) return;
      stepMark = null;
      if (gliding) {
        gliding = false;
        track.style.scrollBehavior = stepBehaviour;
      }
      if (finish) onScrollEnd();
    };

    const stepTick = () => {
      stepFrame = 0;
      if (stepMark === null) return;
      const left = track.scrollLeft;
      const gap = stepMark - left;
      // Close enough: land it. Easing the last pixels out would crawl them over
      // dozens of frames, which reads as the row dragging to a stop.
      if (Math.abs(gap) <= 6) {
        const mark = stepMark;
        stepMark = null;
        track.scrollLeft = Math.round(mark);
        if (gliding) {
          gliding = false;
          track.style.scrollBehavior = stepBehaviour;
        }
        onScrollEnd();
        return;
      }
      // A fixed share of what is left to travel: a card glides in over about a
      // sixth of a second and comes to rest on it. A notch that arrives mid-move
      // only moves the mark, and the next frame carries the extra distance with no
      // restart and no change of speed — which is what lets a turned wheel read as
      // one continuous movement instead of a burst per notch.
      const travel = Math.max(-MAX_STEP, Math.min(MAX_STEP, gap * 0.24));
      // Whole device pixels, like the release glide: an offset held between them
      // makes the browser re-filter the artwork at a new subpixel phase each frame.
      const pixel = 1 / (window.devicePixelRatio || 1);
      track.scrollLeft = Math.round((left + travel) / pixel) * pixel;
      stepFrame = requestAnimationFrame(stepTick);
    };

    const stopGlide = () => {
      if (glideFrame) cancelAnimationFrame(glideFrame);
      glideFrame = 0;
      if (stepMark !== null || stepFrame) stopStep(false);
      gliding = false;
    };

    // Every free-form movement ends through here: the release glide, the
    // alignment after a wheel or trackpad scroll, and a flung row's landing. One
    // eased tween instead of a glide followed by the native smooth scroll, whose
    // fixed short ease is what a snap is — the row would coast and then be
    // pulled onto an edge at the last moment. The curve is quartic out: quick off
    // the mark, a long unhurried tail, and the last pixels are the slowest.
    const glideTo = (target, duration, done) => {
      const from = track.scrollLeft;
      if (Math.abs(target - from) < 0.5) {
        done();
        return;
      }
      gliding = true;
      // Written by hand while the glide runs, so the element's own eased
      // scrolling must not also be applied to each of these writes.
      const behaviour = track.style.scrollBehavior;
      track.style.scrollBehavior = 'auto';
      // Whole device pixels: an offset held between them makes the browser
      // re-filter the artwork at a new subpixel phase on every frame.
      const step = 1 / (window.devicePixelRatio || 1);
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - (1 - t) ** 4;
        track.scrollLeft = Math.round((from + (target - from) * eased) / step) * step;
        if (t < 1) {
          glideFrame = requestAnimationFrame(frame);
          return;
        }
        glideFrame = 0;
        gliding = false;
        track.style.scrollBehavior = behaviour;
        done();
      };
      glideFrame = requestAnimationFrame(frame);
    };

    // Pixels per millisecond over the last ~110ms of the pull, or 0 if the
    // pointer rested before letting go.
    const releaseSpeed = (samples) => {
      if (!samples || samples.length < 2) return 0;
      const last = samples[samples.length - 1];
      let first = samples[0];
      for (let i = samples.length - 1; i >= 0; i -= 1) {
        if (last.t - samples[i].t > 110) break;
        first = samples[i];
      }
      const span = last.t - first.t;
      if (span < 8) return 0;
      return (last.x - first.x) / span;
    };

    // `distance` is in scrollLeft units (already signed), so the glide carries on
    // the way the strip was moving rather than the way the pointer was. Where it
    // lands is a card edge decided before it starts, so the alignment is part of
    // the glide's own easing and never a second movement at the end of it.
    const fling = (distance) => {
      const span = Math.max(-FLING_MAX, Math.min(FLING_MAX, distance));
      if (Math.abs(span) < 24) {
        onScrollEnd();
        return;
      }
      stopGlide();
      const from = track.scrollLeft;
      const raw = from + span;
      const target = stride ? base + Math.round((raw - base) / stride) * stride : raw;
      const shift = stride ? lapShift(target) : 0;
      const travel = Math.abs(target - from);
      // A glide cannot cross the end of the strip. The browser clamps every write
      // past it without saying so, so a target outside the strip leaves the row
      // sitting on that one card edge for the whole glide — up to two thirds of a
      // second of a fast flick travelling nowhere, which reads exactly as the row
      // sticking at the end of a card — and only then took the lap and jumped. The
      // lap is taken first instead. It is invisible, because the ring repeats, and
      // the glide then runs entirely inside the strip: same distance, same speed,
      // from the shifted offset to the shifted target.
      if (shift) lapTo(shift, track.scrollLeft + shift);
      // Longer swipes get longer to come to rest, so a hard flick does not have
      // to brake any harder than a soft one.
      glideTo(target + shift, Math.min(620, 240 + travel * 0.15), onScrollEnd);
    };

    // Wheel, trackpad and drag scrolling are free-form, so once the movement
    // settles, re-align to the nearest card edge — on a ring there is no end to
    // stop at, so this simply picks the nearest of the row's own rest slots.
    // The correction is eased over a time that suits its distance rather than the
    // native smooth scroll's fixed short one, which is what made it read as a snap.
    const settle = () => {
      if (!stride || !runs()) return;
      // A step of the pager is a movement of its own, already aimed at a rest slot.
      if (performance.now() < walkingUntil) return;
      const left = track.scrollLeft;
      const target = base + Math.round((left - base) / stride) * stride;
      if (Math.abs(target - left) <= 1) return;
      // The lap is not a movement and goes instantly; the rest eases in.
      if (lapShift(target)) {
        arrive(target);
        return;
      }
      glideTo(target, Math.min(560, 180 + Math.abs(target - left) * 1.6), onScrollEnd);
    };

    // Nothing is toggled on the strip while it moves: no class, no compositing
    // hint. A `will-change: transform` layer taken at the start of a scroll and
    // dropped at the end snapped the strip's painted bounds to device pixels,
    // so a row painted a fraction of a pixel shorter while it scrolled and
    // came back to its full height at rest.

    const onScrollEnd = () => {
      // A glide in flight ends in a scrollend of its own on every frame; the
      // glide finishes the movement and calls this again when it is done.
      if (gliding) return;
      aim = null;
      // The window is exact again the moment the strip stops (the scroll handler
      // only rebuilds it every so often while it is moving).
      paint(false);
      sync();
      // A pull or a wheel gesture is a free-form scroll with no resting edge
      // yet. Instant scroll frames end in a scrollend each, so settling mid-
      // gesture would snap the strip back under the pointer once per frame;
      // both settle when the gesture is over instead.
      if (drag || performance.now() < wheelQuietUntil || performance.now() < walkingUntil) return;
      settle();
    };

    // One click is one page; a press *held* on the pager keeps paging, the way a
    // scrollbar's arrow does — a row of thirty is a lot of clicking otherwise. The
    // click that ends a hold is swallowed once so the release does not add a page
    // on top of the ones the hold already made.
    const held = new WeakSet();
    const bindPager = (button, direction) => {
      let delay = 0;
      let repeat = 0;
      const stop = () => {
        clearTimeout(delay);
        clearInterval(repeat);
        delay = 0;
        repeat = 0;
      };
      button.addEventListener('pointerdown', () => {
        if (button.disabled) return;
        stop();
        delay = setTimeout(() => {
          delay = 0;
          if (button.disabled) return;
          held.add(button);
          page(direction);
          repeat = setInterval(() => {
            if (button.disabled) {
              stop();
              return;
            }
            page(direction);
          }, 420);
        }, 380);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
        button.addEventListener(type, stop);
      });
      button.addEventListener('click', (event) => {
        if (held.has(button)) {
          held.delete(button);
          event.preventDefault();
          return;
        }
        page(direction);
      });
    };
    bindPager(prev, -1);
    bindPager(next, 1);
    // One pass per frame, not one per scroll event: a trackpad reports two or
    // three positions per frame, and each pass is a layout read plus DOM work.
    let scrollPending = false;
    // The window of cards is rebuilt at most this often while the strip is
    // moving. Rebuilding it every frame inserts and removes cards mid-scroll,
    // and each change re-layerizes the strip; ten cards of hold either side
    // cover well over this interval even at pager speed, so no card is ever
    // missing from the edge of the window. The row always paints once more when
    // the movement ends, so the final window is exact.
    const PAINT_EVERY_MS = 100;
    let paintedAt = 0;
    track.addEventListener('scroll', () => {
      if (scrollPending) return;
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        const now = performance.now();
        if (now - paintedAt >= PAINT_EVERY_MS) {
          paintedAt = now;
          paint(false);
        }
        // A scroll this page does not drive — a wheel, a two-finger sweep, a
        // touch pan — has no lap of its own: at the end of the strip the browser
        // runs out of range and the gesture is stuck there until it is over, and
        // both ends are ordinary card edges (a ring's last clones), so it reads
        // as the row sticking on a card. A lap is invisible because the strip
        // repeats, so it is taken under the fingers, and the scroll carries on
        // into the room it creates.
        if (!drag && !gliding && maxScroll() > stride) {
          const left = track.scrollLeft;
          const cap = maxScroll();
          const shift = left <= 1 ? lapShift(-1) : left >= cap - 1 ? lapShift(cap + 1) : 0;
          if (shift) lapTo(shift, left + shift);
        }
        sync();
      });
    }, { passive: true });
    ['wheel', 'pointerdown', 'touchstart'].forEach((type) => {
      // A new gesture takes the strip back from a glide still running; the glide
      // writes scrollLeft every frame and would otherwise overwrite it.
      track.addEventListener(type, () => { aim = null; stopGlide(); }, { passive: true });
    });
    // A wheel or two-finger scroll over the track is left to the browser, which
    // has momentum the page cannot reproduce. It also stops at the end of the
    // strip, so while one is running the loop below gives the ring a lap to
    // carry on into.
    track.addEventListener('wheel', () => {
      if (!drag) wheelQuietUntil = performance.now() + 180;
    }, { passive: true });
    if ('onscrollend' in window) {
      track.addEventListener('scrollend', onScrollEnd);
    } else {
      let settleTimer;
      track.addEventListener('scroll', () => {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(onScrollEnd, 160);
      }, { passive: true });
    }
    // A track on a hidden view measures zero wide; observing its box re-lays it
    // out when a view switch or window resize gives it a real width. Card size
    // depends on width alone, so a height-only change (a mobile URL bar, a
    // panel opening) skips the layout entirely, and the rest share one frame.
    // ── Drag to pull ────────────────────────────────────────────────────
    // Press and move on a card used to lift the <img> itself: the browser's
    // native image drag is a ghost of the artwork that follows the pointer and
    // never scrolls the row. The images are marked undraggable and the track
    // refuses `dragstart`, which leaves the gesture here — a pointer-capture
    // drag that sets scrollLeft, with an axis lock so a mostly vertical pull
    // still scrolls the page instead of snagging the shelf.
    const DRAG_SLOP = 6;    // px of travel before a press becomes a pull
    let drag = null;
    // The pointer this row was last handed, whether or not its pull is still
    // running: `resume` needs to know whose move it is allowed to take back.
    let pullId = -1;
    let swallowClickUntil = 0;
    // Only set when a press on a pager turned into a pull: a drag of the row
    // itself must not eat a click on the pager that follows it.
    let swallowPagerUntil = 0;

    // The press that ends a pull is not also a click on the card underneath it.
    track.addEventListener('click', (event) => {
      if (performance.now() >= swallowClickUntil) return;
      event.stopPropagation();
      event.preventDefault();
    }, true);

    const finishDrag = () => {
      if (!drag) return;
      const { moved, id: dragId, fromPager } = drag;
      // Read before the pull is forgotten: the last stretch of the gesture is
      // the only part that says how fast it was moving when it let go.
      const speed = releaseSpeed(drag.samples);
      drag = null;
      try {
        if (track.hasPointerCapture(dragId)) track.releasePointerCapture(dragId);
      } catch (error) {
        // Already gone with the pointer.
      }
      track.style.scrollBehavior = '';
      document.body.classList.remove('is-row-dragging');
      if (!moved) return;
      swallowClickUntil = performance.now() + 320;
      if (fromPager) swallowPagerUntil = performance.now() + 320;
      // The strip scrolls against the pointer (scrollLeft = left - dx), so the
      // glide travels the opposite way to the pointer's own speed.
      if (Math.abs(speed) >= FLING_MIN) {
        fling(-speed * FLING_MS);
        return;
      }
      // A released strip settles onto a card edge, the same snap a trackpad
      // swipe gets, so a pull never leaves the row half a card out of line.
      onScrollEnd();
    };

    // The row lends its pull to the page-level pointer driver. It cannot live
    // on the track alone: the hover panel sits on top of the card it describes,
    // so the press that starts most pulls lands on the panel, not the track.
    row.__pull = {
      // Whether the last pull moved far enough that the click it would produce is
      // not a click: a press that started on a pager and then dragged the row
      // must not page it as well.
      swallow: () => performance.now() < swallowPagerUntil,
      begin: (event) => {
        if (!runs()) return false;
        // A new press takes the strip back from a glide still running.
        stopGlide();
        pullId = event.pointerId;
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          axis: null,
          moved: false,
          released: false,
          lastX: event.clientX,
          virt: 0,
          samples: [{ t: performance.now(), x: event.clientX }]
        };
        drag.fromPager = !!event.target.closest?.('.row__prev, .row__next');
        return true;
      },
      move: (event) => {
        if (!drag) return false;
        // A second pointer on the glass — a palm on a touchscreen laptop, a pen
        // laid down — is not this pull's business. Ignoring it keeps the pull
        // alive; dropping it here is what stopped rows dead under a held mouse.
        if (event.pointerId !== drag.id) {
          // A different id mid-gesture is normally a second pointer — a palm on a
          // touchscreen laptop — and is ignored so the pull survives it. If the
          // moves keep coming from that id alone, the pointer the pull was taken
          // with is gone, and ignoring it would leave the row silent for the rest
          // of the gesture: adopt the one that is actually moving.
          drag.strays = (drag.strays || 0) + 1;
          if (drag.strays < 3) {
            return true;
          }
          drag.strays = 0;
          drag.id = event.pointerId;
          pullId = event.pointerId;
          try {
            track.setPointerCapture(event.pointerId);
          } catch (error) {
            // Same as any other capture: a pull works without it.
          }
        } else {
          drag.strays = 0;
        }
        if (!event.buttons) {
          // Either the release happened where we could not see it, or a device
          // reported one frame with no buttons mid-gesture. One such frame is
          // ignored; the second in a row is taken as the release.
          if (!drag.released) {
            drag.released = true;
            return true;
          }
          finishDrag();
          return false;
        }
        drag.released = false;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.axis) {
          if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return true;
          // Down the page wins ties: only a mostly sideways pull takes the row,
          // so scrolling past the shelves in a mostly vertical gesture is safe.
          if (Math.abs(dy) >= Math.abs(dx)) {
            drag = null;
            return false;
          }
          drag.axis = 'x';
          // Held for the rest of the gesture: the moves keep arriving when the
          // pointer leaves the window, and the release always reaches the row
          // instead of being lost outside it.
          try {
            track.setPointerCapture(event.pointerId);
          } catch (error) {
            // A pointer the browser will not capture is still a usable pull.
          }
          // Under the pointer, not easing towards it: a smooth scroll-behind
          // would make the pull feel like it is working against a rubber band.
          track.style.scrollBehavior = 'auto';
          drag.virt = track.scrollLeft;
          document.body.classList.add('is-row-dragging');
          // The panel is measuring cards that are now moving under it.
          hidePreview(0);
        }
        drag.moved = true;
        // Stepped, and summed by the pull itself. The press position it is stepped
        // from is tracked here rather than read back from the strip, so a write the
        // browser clamped at an end cannot shorten the next step — which is how a
        // pull ends up sitting on the very last card's edge and going nowhere.
        const step = event.clientX - drag.lastX;
        drag.lastX = event.clientX;
        const wanted = drag.virt - step;
        // The strip is only as long as the spacers painted for the last offset
        // make it, and those are rebuilt on a timer while a strip is moving. A
        // pull can outrun that timer, and then the strip really is a window short
        // of the ring: `maxScroll()` reports an end that is thousands of pixels
        // inside it, every lap is measured against that end, and the write the
        // lap needs is clamped back to it — a pull that lands on a card edge and
        // will not leave it. So the window is reconciled with the offset the pull
        // is actually on before the strip's end is read. Unforced: this is a
        // no-op in the common case, where the window already covers the offset.
        paint(false);
        // Where the strip can go right now. The lap is decided on this and not on
        // a value remembered from earlier in the gesture: a strip that has got
        // shorter since would leave the wrap point beyond its real end, and every
        // write past that end is clamped to it — which is a pull that sits on the
        // last card's edge and goes no further.
        const cap = maxScroll();
        const shift = lapShift(wanted, cap);
        // The pull has run past the end of the scrollable strip. Left alone the
        // browser would clamp it there and the row would refuse to move any
        // further until the gesture ended, so the ring takes the lap mid-pull
        // instead: the jump is invisible and the painted cards keep their
        // pictures.
        // Kept even when the strip refused the write: a clamped step must not be
        // allowed to shorten the next one, or the pull keeps landing on the same
        // edge every frame.
        drag.virt = wanted + shift;
        const target = Math.max(0, Math.min(cap, drag.virt));
        if (shift) lapTo(shift, target);
        track.scrollTo({ left: target, behavior: 'instant' });
        // The browser has the last word on where the strip ends, and it is not
        // always where `maxScroll()` puts it: a spacer a frame behind, a window
        // still being rebuilt. A write it takes less of than it was given means
        // the pull has run into an end the arithmetic cannot see, so a turn of the
        // ring is taken from the offset it did take — the only one known real.
        const took = track.scrollLeft;
        if (Math.abs(took - target) > 1) {
          const span = items.length * stride;
          const turn = took < target ? -span : span;
          if (span && took + turn >= 0 && took + turn <= maxScroll()) drag.virt = lapTo(turn, took + turn);
        }
        // The last few positions, for the release speed. A short window is
        // enough to say how fast the pointer was going at the end; older
        // samples are dropped so a slow start never dilutes a quick finish.
        const now = performance.now();
        drag.samples.push({ t: now, x: event.clientX });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 160) drag.samples.shift();
        return true;
      },
      // The release only counts if it is this pull's own pointer: another
      // finger lifting is not this gesture ending, and saying so lets the driver
      // keep routing moves to this row.
      end: (event) => {
        if (event && drag && event.pointerId !== drag.id) return false;
        finishDrag();
        return true;
      },
      // A pull can be dropped without the release that should have ended it —
      // a pointer the browser cancelled, a gesture the row let go of. The next
      // move of that same pointer, button still down, takes the row back where
      // it left off, so an interrupted drag never has to be started again.
      resume: (event) => {
        if (event.pointerId !== pullId) return false;
        if (!drag) {
          drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            axis: 'x',
            moved: true,
            released: false,
            lastX: event.clientX,
            virt: 0,
            samples: []
          };
          track.style.scrollBehavior = 'auto';
          drag.virt = track.scrollLeft;
          document.body.classList.add('is-row-dragging');
          hidePreview(0);
          try {
            track.setPointerCapture(event.pointerId);
          } catch (error) {
            // Same as the first capture: not required.
          }
        }
        return true;
      }
    };

    // A horizontal wheel step from anywhere the track cannot see (the hover
    // panel, mostly) lands here. One gesture never does both axes: the caller
    // has already decided this delta is horizontal.
    // One card along, eased — what a notch of a Shift-wheel asks for. Pixels were
    // the wrong unit: a notch is a hundred-odd of them, and the settle then pulled
    // the row back onto the edge it started from, so the wheel barely moved it
    // however long it was turned in one direction.
    row.__step = (direction) => {
      if (!direction) return;
      const n = items.length;
      if (!n || !stride || !runs()) return;
      // Chained the way the pager is: a notch that lands while the strip is still
      // travelling steps from the card it is heading for, so turning the wheel
      // faster than the loop keeps up does not lose notches to it.
      // Where the previous notch left the mark if one is still travelling, else
      // where the pager last aimed, else the nearest card: never the live offset,
      // which is half way through a movement and rounds to a card the strip is
      // already leaving.
      const from = stepMark !== null
        ? Math.round((stepMark - base) / stride)
        : aim !== null ? aim : Math.round((track.scrollLeft - base) / stride);
      const to = from + direction;
      aim = to;
      let goal = base + to * stride;
      // A glide cannot cross the end of the strip — the browser clamps every write
      // past it — so a mark outside it takes the lap first. The ring repeats, so
      // the jump is invisible and the movement runs on inside the strip.
      const shift = lapShift(goal);
      if (shift) {
        lapTo(shift, track.scrollLeft + shift);
        goal += shift;
      }
      stepMark = Math.max(0, Math.min(maxScroll(), goal));
      // The settle that follows a scrollend would snap the strip to the nearest
      // edge in the middle of the wheel; a wheel gesture keeps it off.
      wheelQuietUntil = performance.now() + 220;
      if (!stepFrame) {
        if (!gliding) {
          gliding = true;
          stepBehaviour = track.style.scrollBehavior;
          track.style.scrollBehavior = 'auto';
        }
        stepFrame = requestAnimationFrame(stepTick);
      }
    };

    row.__nudge = (dx) => {
      wheelQuietUntil = performance.now() + 180;
      const wanted = track.scrollLeft + dx;
      const cap = maxScroll();
      const shift = lapShift(wanted, cap);
      // A wheel gesture that runs off the end of the strip would stop there and
      // stay stopped until the fingers came off: the ring takes the lap instead,
      // so a scroll that keeps going has somewhere to go.
      if (shift) lapTo(shift, wanted + shift);
      else track.scrollTo({ left: Math.max(0, Math.min(cap, wanted)), behavior: 'smooth' });
    };

    let resizePending = false;
    new ResizeObserver(() => {
      if (track.clientWidth === observedW) return;
      if (resizePending) return;
      resizePending = true;
      requestAnimationFrame(() => {
        resizePending = false;
        aim = null;
        layout();
      });
    }).observe(track);

    // Whether a catalogue has filled this row yet. A row whose first payload
    // arrives on an append line (Upcoming, which is only known at the end) must
    // seed itself rather than grow from an empty track.
    let live = false;

    const setItems = (next, fromCatalogue = false) => {
      if (fromCatalogue) live = true;
      // A copy: the catalogue hands Upcoming's first payload over as its own
      // working array and keeps pushing the next batches into it. Holding that
      // reference here put every grown title on the shelf twice — once when the
      // catalogue pushed it, once when the append line carried it in.
      items = next.slice();
      aim = null;
      nodes.forEach((node) => { releaseArt(node); node.remove(); });
      nodes.clear();
      winStart = -1;
      winEnd = -2;
      seeded = false;
      // A new set of titles is a new row: the slice takes its stand-in from
      // these, not from whatever it was showing before.
      if (!settled) pinnedAt.clear();
      layout();
    };

    // A row grows by a chunk at a time as the catalogue streams in, ten at a
    // time and off screen. The width does not change, so `layout` keeps the row
    // where it is and repaints only the cards whose slot gained a title.
    const addItems = (more) => {
      if (!Array.isArray(more) || !more.length) return;
      if (!live) {
        setItems(more, true);
        return;
      }
      items = items.concat(more);
      aim = null;
      // `false`: keep the reader where they are — a chunk arriving is not a
      // reason to move the row.
      layout(false);
    };

    // A row starts empty and the catalogue fills it.

    // The catalogue is complete, so every row is as long as it will get: the
    // leading slice can stop holding its stand-in and show the real last title.
    const settleRow = () => {
      if (settled) return;
      const swap = () => {
        if (settled) return;
        settled = true;
        settleFrom = new Map([...pinnedAt].map(([slot, place]) => [slot, artFor(items[place]?.still, cardW, 1)]));
        pinnedAt.clear();
        fading = true;
        paint(true);
        fading = false;
      };
      // The leading slice stops holding its stand-in here and takes the row's
      // real last title — the one at the *end* of the row, not the one the
      // stand-in is showing now. So that is the title asked for, and its picture
      // is decoded before the swap as well: the card then fades in already
      // dressed, instead of fading in on the list page's picture and swapping
      // again a beat later, which is what a sliver of a card changing twice
      // looked like.
      const n = items.length;
      const targets = [...new Set(pinnedAt.keys())]
        .map((slot) => items[(((slot - cloneRun) % n) + n) % n])
        .filter(Boolean);
      if (!targets.length) {
        swap();
        return;
      }
      const sizes = () => targets.map((item) => artFor(item.still, cardW, 1)).filter(Boolean);
      // `artFor` has already named the file with this session's cold token, so it
      // is decoded as it stands: asking for it through `decodeSources` would add
      // the token a second time and fetch a second copy nobody uses.
      const preload = (urls) => Promise.all(urls.map((url) => new Promise((done) => {
        const image = new Image();
        image.src = url;
        if (image.decode) image.decode().then(done, done);
        else image.onload = image.onerror = done;
      })));
      warmDetails(targets)
        .then(() => preload(sizes()))
        .then(swap);
      // A slow answer does not hold the shelf: the art lands on the card that
      // is already there, and the fade covers it either way.
      setTimeout(swap, 1500);
    };

    // Everything a shelf is holding, handed back and taken again. The See all
    // grid covers the shelves, and a backgrounded tab paints none of them
    // either: in both cases the decoded artwork is memory nothing is using. The
    // window is rebuilt on the way back rather than patched, so a woken row is
    // the row that was parked — same slots, same titles, same pictures.
    let parked = false;
    const park = () => {
      if (parked) return;
      parked = true;
      row.dataset.parked = '1';
      nodes.forEach((node) => releaseArt(node));
    };
    const wake = () => {
      if (!parked) return;
      parked = false;
      delete row.dataset.parked;
      nodes.forEach((node) => { releaseArt(node); node.remove(); });
      nodes.clear();
      winStart = -1;
      winEnd = -2;
      paint(true);
      scheduleArt();
    };

    rowModels.set(row, { setItems, addItems, settle: settleRow, park, wake, parked: () => parked });

    // A row starts empty and the catalogue fills it. The loader stands in for
    // the shelves until then, which is what a cold shelf looks like.
  };

  // The first ten titles of every shelf wait for their artwork. Those rows are
  // laid out and their gate covers fetched behind `is-rows-pending`, and the
  // page appears in one step once those have decoded — never card by card. The
  // rest of each shelf follows in row order once it is up.
  let revealed = false;
  let artPending = false;
  // The catalogue's second half, once it hands one over: one row grown at a
  // time, after the page is up.
  let catalogueMore = null;
  let growthStarted = false;
  // Rows whose leading slice is still holding its stand-in, keyed by section.
  // That slice is a copy of the row's last title, not one of the ten the loader
  // waits on, so it is settled after that row's ordered pass — the same place
  // its title is dressed.
  const lateSettles = new Map();

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    document.body.classList.remove('is-rows-pending');
    // The screen is up: a full pass measures the shelves that were behind the
    // loader, which is what puts their cards in line for their details.
    scheduleArt();
    scheduleDetails();
    // The page is up on ten covers across the four gate shelves; the last three
    // fill in behind it, then every shelf grows in row order, twenty at a time,
    // until it is whole. The leading slices
    // settle at the end: a slice shows the row's last title, which is the one
    // the ordered pass reaches last, and dressing it before the loader lifts is
    // the whole page's work done before the first ten.
    startGrowth(settleLate);
  };

  // A picture that never arrives is the same as one that arrives late: the wait
  // is capped, so a broken URL cannot leave the page behind its loader. The cap
  // sits well past a slow link's answer on purpose — the page is waiting for the
  // titled artwork of the leading ten of every shelf, and on a phone connection
  // that is seconds, not frames. A file that really is gone stops waiting on its
  // own: three failed tries mark the card dead, which the gate reads as settled.
  const ART_WAIT_MS = 15000;

  const decodeSources = (sources) => Promise.all(sources.map((source) => new Promise((done) => {
    const image = new Image();
    image.src = coldURL(source);
    if (image.decode) image.decode().then(done, done);
    else image.onload = image.onerror = done;
  })));

  // Only the gate: the leading GATE_TITLES of the four gate shelves, whether or
  // not the fold reaches them yet, plus the billboard's own artwork. Waiting on
  // the rest of a shelf would mean waiting on pictures nobody is looking at,
  // which is the work the ordered pass does after the page is up.
  const revealWhenArtReady = () => {
    // Ask for the screenful before measuring it: the schedule has only just been
    // handed these cards, and what the page waits on is the pictures it can see.
    buildArtQueue(ART_SCREEN);
    const onScreen = (box) => box.width > 0 && box.bottom > 0 && box.top < window.innerHeight
      && box.right > 0 && box.left < window.innerWidth;
    // Every card on the page, asked again each pass rather than snapshotted
    // once: the pump hands pictures out a batch at a time, and revealing on
    // whichever batch happened to be in flight is how a shelf appeared bare for
    // a moment while its own pictures were still arriving behind the loader.
    // The shelves are part of the promise now: a row four screens down that
    // turned into its titled covers after the loader was gone is exactly what
    // this gate is for.
    // The leading titles of the four gate shelves — what the first screen and
    // its first flick can reach — not all fifty a shelf holds. The last three
    // shelves' first ten, and the rest of the gate shelves, are dressed in order
    // once the page is up, starting with the very next card.
    const visibleCards = gateCards;
    // The billboard's slide is part of the screenful. Only the one showing: the
    // rest of the set is decoded when it is a slide away from being shown.
    const currentKey = (heroSets[document.body.dataset.view] || heroSets.home || [])[heroIndex];
    const currentSlide = currentKey && heroTitles[currentKey];
    const heroArt = currentSlide
      ? [currentSlide.image, currentSlide.logo].filter(Boolean)
      : [];
    const started = performance.now();
    artPending = true;
    // The billboard's artwork is part of what the page waits on. It used to fade
    // up from black behind the loader on its own, which on a slow link meant the
    // page showed itself with the frame's picture still missing; the reveal is
    // the one moment the reader is promised a dressed screen.
    let heroReady = !heroArt.length;
    decodeSources(heroArt).then(() => { heroReady = true; });
    const step = () => {
      // The whole gate in flight, not the idle batch: twenty at a time is what
      // gets every leading card its source before the page shows itself.
      pumpArt(ART_SCREEN);
      // The screen's details go out while the page is still behind the loader: a
      // card waiting on them has nothing to paint, so the first thing on screen
      // is the card as it will stay.
      if (!detailBusy) flushDetails();
      const cards = visibleCards();
      // Every card has its details, and every picture has decoded. A card whose
      // picture has finally given up waiting does not hold the page behind its
      // loader: it is showing its dark frame on purpose.
      const dressed = cards.every((card) => !card.__item.live || card.__item.dressed || card.__pin);
      // The full file, not just any picture: a card that was painted while it
      // was still off screen is holding the half-size one, and revealing on that
      // sharpened under the reader's eye a moment later. A card the pump has not
      // reached yet has no picture at all, which is the same as one that has not
      // decoded.
      // A lookup already on the wire for this screenful still resolves into a
      // repaint: waiting for the ones asked for is the difference between the
      // page showing itself settled and showing itself a frame before it is.
      const waiting = detailBusy || detailQueue.length > 0 || detailRing.length > 0;
      const ready = heroReady && !waiting && dressed && cards.every((card) => {
        const image = card.querySelector('img[data-src]');
        const item = card.__item;
        if (!image) return !item || !item.still || Boolean(item.dead);
        // A stand-in slice shows whatever it was painted with; only that it is a
        // decoded picture matters there.
        if (card.__pin) {
          return Boolean(image.dataset.dead || (image.getAttribute('src')
            && image.complete && image.naturalWidth > 0));
        }
        // The file it is showing has to be the one its item names now: a card
        // whose details landed a frame ago still holds the list page's picture
        // until the next art pass re-points it, and revealing on that is the
        // textless cover swapping to the titled one in front of the reader.
        // Off screen the small file is the one it will show first, so either
        // size of the same named picture counts as dressed.
        const shot = image.getAttribute('src');
        return image.dataset.dead || Boolean(shot
          && (shot === image.dataset.full || shot === image.dataset.low)
          && image.complete && image.naturalWidth > 0);
      });
      if (ready || performance.now() - started > ART_WAIT_MS) {
        artPending = false;
        reveal();
        return;
      }
      requestAnimationFrame(step);
    };
    step();
  };

  // A card is settled when its own details are on it: until then it is showing
  // the shelf's list art and a caption, and both change under the reader's eye
  // the moment the lookup lands. The page waits on this per card, and reads it
  // from the card's item rather than from the payload, so a shelf that arrives
  // without the server's `deferred` mark still holds its place behind the
  // loader instead of dressing itself in front of the reader.
  const markLive = (items) => items.forEach((item) => {
    item.live = true;
    item.dressed = Boolean(item.facts);
  });

  const renderRow = (name, items) => {
    const row = document.querySelector(`.row[data-section="${name}"]`);
    if (!row || !items || !items.length) return;
    markLive(items);
    rowItems.set(name, items.slice());
    rowModels.get(row)?.setItems(items, true);
  };

  // One more chunk for a row that is already on the page. The row keeps its
  // place and the cards that are up: only what the new titles touch is painted.
  const addRow = (name, items) => {
    const row = document.querySelector(`.row[data-section="${name}"]`);
    if (!row || !items || !items.length) return;
    markLive(items);
    rowItems.set(name, (rowItems.get(name) || []).concat(items));
    rowModels.get(row)?.addItems(items);
  };

  // Bundled cards are already in the DOM by here; live rows re-sync in renderRow.
  document.querySelectorAll('.row').forEach(setupRow);

  const applyCatalog = (data) => {
    // The first line replaces each row; every line after it carries one row's
    // next ten, which that row appends to the shelf it already has.
    Object.entries(data.sections || {}).forEach(([name, items]) => {
      if (data.append) addRow(name, items);
      else renderRow(name, items);
    });

    // Billboards: six titles per destination, keyed by TMDB id. Partial payloads
    // leave a painted destination alone, and the titles merge: a destination
    // that already painted keeps its art when the next line comes.
    const titles = {};
    const sets = {};
    Object.entries(data.hero || {}).forEach(([view, items]) => {
      if (!items || !items.length) return;
      sets[view] = items.map((item) => {
        const key = String(item.id);
        titles[key] = {
          kind: view === 'anime' ? 'anime' : item.media,
          title: item.title,
          desc: item.overview || '',
          image: item.backdrop || item.still,
          logo: item.logo || '',
          media: item.media,
          facts: item.facts || {},
          rating: item.rating || 0,
          // The key the billboard's trailer streams from, when it has one.
          trailer: item.trailer || ''
        };
        return key;
      });
    });
    if (Object.keys(sets).length) {
      heroTitles = { ...heroTitles, ...titles };
      heroSets = { ...heroSets, ...sets };
    }
    // Whatever the payload carried, the billboard is now painted from state.
    const first = heroPending;
    heroPending = false;
    document.body.classList.remove('is-hero-pending');
    // Only paint when this line is what the billboard was waiting for, or when
    // it brings the set on screen: repainting art that is already up flashes it.
    if (first || sets[document.body.dataset.view]) {
      renderHero(heroIndex);
      preloadHeroes(document.body.dataset.view);
    }
  };

  // ── Hover card ────────────────────────────────────────────────────────
  // A card carries the catalogue item it was built from, so the panel is
  // filled synchronously: no request, no wait, nothing to cache.
  const preview = document.querySelector('#card-preview');
  // One artwork layer, swapped in place (see the markup note): a second layer
  // faded over this one put the picture on a composited surface, and a
  // composited layer is placed on whole device pixels, so the panel's copy of
  // the photo sat up to a pixel off the card's copy for the length of the fade
  // and hopped into line when it ended. One <img>, never faded, is painted
  // exactly the way the card under it is painted.
  const previewArt = preview.querySelector('.preview__art');
  let travelFrame = 0;

  // `source` is the card's own <img>, not just a URL: copying its srcset and
  // sizes as well means the browser picks the same file for the panel as it did
  // for the card. Handing over only a URL pinned the panel to one variant, and
  // the same photo at two sizes has two pixel aspects — so object-fit: cover
  // cropped on a different axis and the picture looked shifted.
  const showArt = (source) => {
    const el = typeof source === 'string' ? null : source;
    // A card whose picture is still waiting its turn in the schedule already
    // knows which file it will be, so the panel can show it at once.
    // The panel prints a card's artwork at the card's own width, so it asks for
    // the full file even when the card itself is still holding the half-size one.
    const src = el
      ? el.dataset.full || el.currentSrc || el.getAttribute('src') || el.dataset.src || ''
      : source || '';
    if ((previewArt.getAttribute('src') || '') === src) return;
    if (!src) {
      previewArt.removeAttribute('src');
      previewArt.removeAttribute('srcset');
      return;
    }
    // The old picture stays on screen while the new one loads: a replaced
    // <img> keeps its last frame until the next one is ready, so the swap has
    // no blank in it and needs no fade to hide one.
    previewArt.src = src;
    if (el?.getAttribute('srcset')) previewArt.setAttribute('srcset', el.getAttribute('srcset'));
    else previewArt.removeAttribute('srcset');
    if (el?.getAttribute('sizes')) previewArt.setAttribute('sizes', el.getAttribute('sizes'));
    else previewArt.removeAttribute('sizes');
  };
  const previewKind = preview.querySelector('.preview__kind');
  const previewCert = preview.querySelector('.preview__cert');
  const previewRelease = preview.querySelector('.preview__release');
  const previewRating = preview.querySelector('.preview__rating');
  const previewRatingValue = preview.querySelector('.preview__rating-value');
  const previewProgress = preview.querySelector('.preview__progress');
  const previewRank = preview.querySelector('.preview__rank');
  const previewRuntime = preview.querySelector('.preview__runtime');
  const previewGenres = preview.querySelector('.preview__genres');
  const previewList = preview.querySelector('.preview__list');
  const previewLabel = previewList.querySelector('span');
  // Local for now: there is nothing behind My List yet, so it is state on this
  // page rather than a request.
  // The three words the server derives for where a title sits in its release.
  const RELEASE_LABELS = { theaters: 'In Theaters', unreleased: 'Unreleased', released: 'Released' };
  const myList = new Set();
  let hoveredCard = null;
  let hoveredRow = null;
  let hideTimer = 0;

  // The panel stays open while the pointer is on the card, on the panel, or on
  // the row's pager where it rises above them: all three are one target.
  const HOVER_CHAIN = '.card, #card-preview, .row__prev, .row__next';

  // ── Drag to pull, page-wide ───────────────────────────────────────────
  // One pointer driver for every row, because a pull can start on either the
  // track or the hover panel drawn over it. Each row lends its own state
  // through `row.__pull`; this only routes the pointer to the right one. A
  // listener bound to the track alone never fires for the common case, where
  // the panel covers the card under the pointer.
  let pullRow = null;
  // The row the press was handed to, kept after a drop that no release
  // explained: the next move of that pointer can take it back.
  let heldRow = null;

  document.addEventListener('pointerdown', (event) => {
    // Touch already pans a scroll container natively; a pull on top of that
    // would fight the browser's own scrolling.
    if (event.pointerType === 'touch' || event.button !== 0) return;
    // A button in the panel is a button, not a handle for the row beneath it.
    const button = event.target.closest?.('button, a');
    // …except the two glass pagers. They are drawn over the row's ends, exactly on
    // top of the card edge a reader grabs to pull the shelf — the last card's tail
    // on one side, the first card's on the other — so a press there that moves is
    // a pull of the row underneath, and the click it would end with is swallowed.
    // Pressed and released in place, it still pages.
    const pager = button && button.closest?.('.row__prev, .row__next');
    if (button && !pager) return;
    // A new press supersedes whatever the last one left held.
    heldRow = null;
    const track = pager ? pager.closest('.row')?.querySelector('.row__track')
      : event.target.closest?.('.row__track');
    const row = track ? track.closest('.row')
      : event.target.closest?.('#card-preview') ? preview.__row : null;
    if (!row || !row.__pull) return;
    if (row.__pull.begin(event)) {
      pullRow = row;
      heldRow = row;
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (!pullRow) {
      // Nothing is being pulled, but a press is still down on a row: this is an
      // interrupted pull, not a hover. Take it back rather than leaving the row
      // stuck where the interruption left it.
      if (!heldRow || !event.buttons) return;
      if (!heldRow.__pull.resume(event)) return;
      pullRow = heldRow;
      if (!pullRow.__pull.move(event)) pullRow = null;
      return;
    }
    // Whether a move without a button ends the pull is the row's call: it knows
    // which pointer it took and can tell one odd frame from a lost release.
    if (!pullRow.__pull.move(event)) pullRow = null;
  });

  const releasePull = (event) => {
    if (!pullRow) return;
    const row = pullRow;
    // A release from some other pointer is not this pull ending: keep the row
    // on the hook for the moves that are still coming.
    if (row.__pull.end(event) === false) return;
    if (pullRow === row) pullRow = null;
    // The press itself is over only on a release: a cancelled pointer leaves
    // the row held, so a move that still arrives can resume it.
    if (!event || event.type === 'pointerup') heldRow = null;
  };
  document.addEventListener('pointerup', releasePull);
  document.addEventListener('pointercancel', releasePull);

  // A press-and-move on artwork otherwise becomes the browser's native image
  // drag — a ghost of the picture that follows the pointer and never scrolls.
  // Refused at the document so the panel's own picture is covered too.
  document.addEventListener('dragstart', (event) => {
    if (event.target.closest?.('.row__track, #card-preview')) event.preventDefault();
  }, true);

  // A press on a pager that turned into a pull of the row is not also a press of
  // that pager: the release's click is swallowed, so dragging the shelf past its
  // end never pages it at the same time.
  document.addEventListener('click', (event) => {
    const pager = event.target.closest?.('.row__prev, .row__next');
    if (!pager) return;
    const row = pager.closest('.row');
    if (!row || !row.__pull || !row.__pull.swallow()) return;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  // ── Wheel: one gesture, one axis ──────────────────────────────────────
  // A wheel event is a single signed delta, so nothing here scrolls both ways
  // at once: the gesture's dominant axis wins and the other is left alone.
  // Vertical is the page's — it is never intercepted. Horizontal belongs to
  // the row under the pointer.
  //
  // Over a track the browser already does that itself, with the platform's own
  // momentum, so those events are left untouched. The gap is the hover panel:
  // it is drawn over the row and is not a scroll container, so a sideways
  // swipe there scrolls nothing. That is what this routes.
  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) return;          // pinch-zoom
    const inTrack = event.target.closest?.('.row__track');
    // A stepped mouse wheel with Shift is the one gesture a horizontal shelf never
    // receives properly. The browser reports it either way round depending on the
    // platform — a vertical delta it spends on the page, which has nothing
    // sideways to scroll, so the row sits still however long the wheel is turned;
    // a horizontal one it spends on the strip itself, a hundred-odd pixels that
    // the row's settle then rounds back to the card they started on, so the row
    // barely moves either way. Both are handed to the row's own step instead: one
    // card a notch, eased, laps and all. A trackpad reports its axis without Shift
    // and is left alone below, with its momentum intact.
    if (inTrack && event.shiftKey) {
      const shelf = inTrack.closest('.row');
      const axis = event.deltaX || event.deltaY;
      if (shelf && shelf.__step && axis) {
        event.preventDefault();
        shelf.__step(axis > 0 ? 1 : -1);
        return;
      }
    }
    if (inTrack) return;                                // native, momentum intact
    const row = event.target.closest?.('#card-preview') ? preview.__row : null;
    if (!row || !row.__nudge) return;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
    let dx = event.deltaX * scale;
    let dy = event.deltaY * scale;
    // A stepped mouse wheel carries no X at all; Shift is what turns it into a
    // horizontal gesture, and a trackpad reports the axis it already means.
    if (!dx && event.shiftKey) { dx = dy; dy = 0; }
    // Mostly vertical: the page scrolls, exactly as it would anywhere else.
    if (Math.abs(dx) <= Math.abs(dy)) return;
    event.preventDefault();
    row.__nudge(dx);
  }, { passive: false });

  // A film is one runtime; a series is its seasons and how long an episode
  // runs. Missing numbers drop out instead of printing a blank.
  const duration = (item) => {
    const facts = item.facts || {};
    if (item.media !== 'tv') {
      if (!facts.runtime) return '';
      const hours = Math.floor(facts.runtime / 60);
      return hours ? `${hours}h ${facts.runtime % 60}m` : `${facts.runtime}m`;
    }
    const parts = [];
    if (facts.seasons) parts.push(`${facts.seasons} season${facts.seasons === 1 ? '' : 's'}`);
    if (facts.episodes) parts.push(`${facts.episodes}m`);
    return parts.join(' · ');
  };

  // ── Trailer ─────────────────────────────────────────────────────────────────
  // The artwork turns into the title's trailer once the pointer has rested on
  // the card, so skimming a row does not fire off a frame per card. TMDB hands
  // over the YouTube key with the rest of the details, and the frame is built
  // from it: YouTube's embed, muted, its chrome cropped out by an overflowing
  // box because none of it can be restyled from here.
  // Backstop for the player's reveal: it normally reports when it starts, but
  // where that message never arrives the frame is shown anyway after this.
  const EMBED_CHROME = 3400;
  // The player floats a large pause control over the middle of the picture when
  // playback begins and takes it away again a moment later. It sits over the
  // film, so no crop reaches it: the reveal waits it out instead.
  const EMBED_SETTLE = 1200;
  // How long the pointer has to rest on a card before its player is built.
  // How long the pointer must rest on a card before a player is built for it.
  // A YouTube embed is a document, a network request, a decoder and its own
  // scrolling chrome, and putting one together costs tens of milliseconds of
  // main thread — a sweep across a row at 110ms a card was still building one
  // (measured: a player in a six-card pass), then tearing it down again on the
  // next card. A rest that short is not a decision to watch anything, so the
  // dwell is long enough that crossing a shelf never builds a player at all.
  // The artwork is already up while this waits; nothing visible is delayed.
  const TRAILER_DWELL = 600;
  let trailerDwell = 0;
  let trailerKey = '';
  let trailerEmbed = null;
  let trailerReveal = 0;
  let trailerSettle = 0;
  let embedReady = false;

  const dropEmbed = () => {
    clearTimeout(trailerReveal);
    clearTimeout(trailerSettle);
    trailerReveal = 0;
    trailerSettle = 0;
    embedReady = false;
    if (trailerEmbed) {
      const { shell, frame } = trailerEmbed;
      // Blank the frame before it leaves. Removing it is what stops the player,
      // and pointing it at nothing in the same task means no decoder, network
      // request or player timer outlives the card it belonged to.
      try {
        frame.src = 'about:blank';
      } catch {
        /* the frame is already gone */
      }
      frame.remove();
      shell.remove();
      trailerEmbed = null;
    }
  };

  const dropTrailer = () => dropEmbed();

  const stopTrailer = () => {
    clearTimeout(trailerDwell);
    trailerDwell = 0;
    dropTrailer();
    trailerKey = '';
  };

  const showTrailer = () => {
    if (!trailerEmbed || !embedReady) return;
    clearTimeout(trailerReveal);
    trailerReveal = 0;
    trailerEmbed.shell.classList.add('is-playing');
  };

  // The frame itself. Its chrome cannot be restyled or reached from here,
  // so it is cropped out instead — the frame is scaled up inside a clipped box
  // (see .preview__trailer) so the title bar, the transport strip and the mark
  // all fall outside the visible area, the same 1.36 the reference build uses.
  // It takes no pointer events either, so hovering can never summon them.
  const embedTrailer = (item, key) => {
    const shell = document.createElement('div');
    shell.className = 'preview__trailer';
    const frame = document.createElement('iframe');
    frame.tabIndex = -1;
    frame.title = `${item.title || 'Title'} trailer`;
    frame.allow = 'autoplay; encrypted-media';
    frame.setAttribute('allowfullscreen', '');
    frame.src = youtubeEmbed(key);

    const send = (payload) => {
      try {
        frame.contentWindow?.postMessage(JSON.stringify(payload), '*');
      } catch {
        /* the player is gone */
      }
    };
    const reveal = () => {
      if (!trailerEmbed || trailerEmbed.shell !== shell) return;
      clearTimeout(trailerReveal);
      trailerReveal = 0;
      embedReady = true;
      showTrailer();
    };

    frame.addEventListener('load', () => {
      // Ask the player to say when it is really playing. Silence is not proof
      // of anything — some browsers never deliver these messages — so the
      // timer below still shows the frame on its own.
      send({ event: 'listening', id: 1, channel: 'widget' });
      send({
        event: 'command', func: 'addEventListener', args: ['onStateChange'],
        id: 1, channel: 'widget'
      });
      clearTimeout(trailerReveal);
      trailerReveal = setTimeout(reveal, EMBED_CHROME);
    });

    shell.append(frame);
    trailerEmbed = { shell, frame };
    preview.querySelector('.preview__media').append(shell);
  };

  // The player announces its state to the parent; that, not a stopwatch, is
  // what fades the cropped frame in. Anything else it says is ignored.
  window.addEventListener('message', (event) => {
    if (!trailerEmbed) return;
    const { shell, frame } = trailerEmbed;
    if (event.source !== frame.contentWindow) return;
    let data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (!data || typeof data !== 'object') return;
    if (data.event === 'onReady') {
      const command = (func, args = []) => frame.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), '*'
      );
      command('addEventListener', ['onStateChange']);
      command('mute');
      command('playVideo');
      return;
    }
    const state = data.event === 'onStateChange'
      ? data.info
      : data.event === 'infoDelivery' ? data.info && data.info.playerState : undefined;
    if (state === 0) {
      // The trailer reached its end. Without a loop the player would fill the
      // frame with its own end card, so the artwork comes back instead.
      clearTimeout(trailerSettle);
      trailerSettle = 0;
      shell.classList.remove('is-playing');
      return;
    }
    if (state === 2) {
      // A paused player keeps that centre control up forever: ask it to run
      // again rather than show a still with a button on it.
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' }),
        '*'
      );
      return;
    }
    if (state === 1) {
      // Running: hold the artwork until the centre control has faded, then show
      // the frame. Anything already scheduled is replaced by this.
      clearTimeout(trailerReveal);
      trailerReveal = 0;
      clearTimeout(trailerSettle);
      trailerSettle = setTimeout(() => {
        trailerSettle = 0;
        if (!trailerEmbed || trailerEmbed.shell !== shell) return;
        embedReady = true;
        showTrailer();
      }, EMBED_SETTLE);
    }
  });

  const playTrailer = (item) => {
    const key = (item.facts || {}).trailer || '';
    // Same title repainted (My List, a resize): whatever is playing stays.
    if (key && key === trailerKey && (trailerEmbed || trailerDwell)) return;
    stopTrailer();
    if (!key) return;
    trailerKey = key;
    // Built once the pointer has settled, not on the way past. A player is tens
    // of megabytes of page and a decoder of its own, and a sweep across a row is
    // a dozen cards a second — the artwork is already up, so nothing visible
    // waits for this. Leaving the card cancels it.
    trailerDwell = setTimeout(() => {
      trailerDwell = 0;
      embedTrailer(item, key);
    }, TRAILER_DWELL);
  };

  const paintPreview = (card) => {
    const item = card.__item;
    const facts = item.facts || {};
    // The very file the card is showing, not just the same photo: another size
    // of it has a slightly different pixel aspect (275x154 against 780x439), and
    // object-fit: cover then crops on the other axis, so the picture came back
    // shifted by a pixel or two.
    showArt(card.querySelector('.card__media img') || item.still || '');
    previewKind.textContent = item.media === 'tv' ? 'Series' : 'Film';
    previewCert.textContent = facts.cert || '';
    previewCert.hidden = !facts.cert;
    // Availability is a tag rather than a sentence: cinemas, not out yet, or
    // out — one of three short words, so the facts line stays scannable.
    const release = (item.facts || {}).release || '';
    previewRelease.textContent = RELEASE_LABELS[release] || '';
    previewRelease.dataset.state = release;
    previewRelease.hidden = !RELEASE_LABELS[release];
    // TMDB's audience score, out of ten, comes with the list payload — no extra
    // request. A title nobody has voted on has 0, and is shown without one
    // rather than with a zero.
    const score = Number(item.rating) || 0;
    previewRating.hidden = !score;
    previewRatingValue.textContent = score ? score.toFixed(1) : '';
    previewRating.setAttribute('aria-label', score ? `Rated ${score.toFixed(1)} out of 10` : '');
    // Continue Watching's resume bar, carried over: it is drawn on the card's
    // artwork, so the panel's own copy of that artwork covered it and the bar
    // vanished the moment the pointer arrived. Same bar, same place, so a
    // part-watched card looks the same open and closed.
    const progress = Number(item.progress) || 0;
    previewProgress.hidden = !progress;
    previewProgress.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
    // The place in the row, carried over the same way: the panel covers the
    // card's artwork, and the number is printed on that artwork. Without its own
    // copy the corner mark would vanish the moment the pointer arrived and come
    // back when it left — the same flicker the resume bar used to have.
    const rank = Number(card.__rank) || 0;
    previewRank.hidden = !rank;
    previewRank.textContent = rank ? String(rank) : '';
    previewRuntime.textContent = duration(item);
    previewRuntime.hidden = !previewRuntime.textContent;
    previewGenres.textContent = (facts.genres || []).join(' · ');
    previewGenres.hidden = !previewGenres.textContent;
    const added = myList.has(`${item.media}:${item.id}`);
    previewList.classList.toggle('is-added', added);
    previewList.setAttribute('aria-pressed', String(added));
    previewLabel.textContent = added ? 'In My List' : 'My List';
    playTrailer(item);
  };

  // Over the card it came from, exactly as wide as it: the panel is the same
  // card with its facts underneath, not a bigger one, so the row's rhythm — the
  // artwork's edges, the gap to its neighbours — stays where the pointer left
  // it. Everything the wider panel showed fits in a card: the facts line, the
  // runtime, the genres (wrapping to a second line when they must) and the
  // button are all one column. Pulled in only where the window would cut it off.
  const placePreview = (card) => {
    const box = card.getBoundingClientRect();
    // The panel is the card's width where the window has room for it, and the
    // window less a margin where it does not. It is a fixed width otherwise: a
    // 275px panel in a 270px window can only be placed by overflowing, and the
    // panel's own clip then cuts the end of its last line off.
    const edge = 12;
    // Exact, not rounded: the panel's or the card's artwork would be resampled
    // against a half pixel of offset, which reads as the picture shifting as the
    // panel opens.
    const width = Math.min(box.width, window.innerWidth - edge * 2);
    // Where the panel was before this call: the travel to the new card is a
    // translate from that old spot to the new one, rather than an animation of
    // left/top. Read before they are overwritten.
    const moving = preview.classList.contains('is-open');
    const wasLeft = parseFloat(preview.style.left || '0');
    const wasTop = parseFloat(preview.style.top || '0');
    preview.style.width = `${width}px`;
    // One line of facts, in whatever font this machine has. The chips and the
    // score are measured against the width the panel was just given and the
    // line steps down until they fit side by side — measured, not guessed,
    // because a system font can run several percent wider than the one this was
    // designed on, and a guess wrapped the certificate onto a line of its own.
    preview.style.removeProperty('--facts-size');
    const factsLine = preview.querySelector('.preview__facts');
    // The line has to fit the panel's width in one row. Stepping it down half a
    // point at a time and measuring after each step is the obvious way, and it
    // is a forced layout per step, on every card the pointer crosses. Text width
    // is proportional to font size, so one measurement of the overflow gives the
    // size to try directly; one more measurement confirms it, and only a font
    // that wraps unpredictably costs a third.
    let factsFit = false;
    let size = 12;
    if (factsLine.scrollWidth > factsLine.clientWidth) {
      const fitted = (12 * factsLine.clientWidth) / factsLine.scrollWidth;
      size = Math.min(12, Math.max(9.5, Math.ceil(fitted * 2) / 2));
    }
    for (; size >= 9.5; size -= 0.5) {
      preview.style.setProperty('--facts-size', `${size}px`);
      factsFit = factsLine.scrollWidth <= factsLine.clientWidth;
      if (factsFit) break;
    }
    // Even the smallest line overflows: let the chips wrap inside their group
    // rather than run past the panel, where the edge would cut the score off.
    if (!factsFit) preview.style.removeProperty('--facts-size');
    preview.classList.toggle('is-facts-tight', !factsFit);
    // The card's own spot, exactly: the panel's picture has to sit on the same
    // fraction of a pixel the card's does, or the two copies disagree by the bit
    // a snap moved them.
    const left = Math.max(
      edge,
      Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - edge)
    );
    const top = box.top;
    // Downward only: the panel's top edge is the card's, so the 16:9 art lands
    // exactly where the card's art is and everything the panel adds grows
    // below it. It is never nudged up to make room — a card near the bottom
    // runs to the window edge rather than jumping above itself.
    const dx = wasLeft - left;
    const dy = wasTop - top;
    cancelAnimationFrame(travelFrame);
    travelFrame = 0;
    if (!moving || (!dx && !dy)) {
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
      return;
    }
    // The slide from the card it is on to the card under the pointer, stepped
    // here rather than by a CSS transition: a transition hands the box to the
    // compositor and slides it through fractional offsets, at which the sheet's
    // text drops out of subpixel antialiasing (measured: 36% less ink for the
    // length of the slide), so the digits read as bobbing. Laid out frame by
    // frame, every frame is painted the way the rest state is.
    //
    // Only the axis that moves is written. Within a row the tops are all the
    // same, and writing the vertical one anyway — rounded to a device pixel, as
    // this used to — hopped the panel 0.3px down for the length of every slide
    // and back at the end.
    // The destination is written now and only a translate moves from there, so
    // the slide is a composited layer being offset rather than a fixed box being
    // re-laid out and re-painted at a new `left` on every frame. The layer is
    // taken when the panel first travels and given back when it closes: taking
    // and dropping it per slide measured worse than laying the box out per
    // frame, because a layer created and destroyed twenty times across a row
    // costs more than the twenty layouts it saves.
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
    if (!preview.style.willChange) preview.style.willChange = 'transform';
    // Whole device pixels, counted from where the travel ends. A fractional
    // offset makes the browser re-filter the artwork at a new subpixel phase on
    // every frame, so the picture crawls by up to a pixel inside its frame while
    // the panel moves — seen on the vertical slide, where the card below is
    // still for comparison. A whole-device-pixel step just moves the already
    // painted picture. Counting from the destination rather than from zero is
    // the part that matters: the rest position is itself fractional (the rows
    // sit at 714.125), so snapping to whole numbers would put the art on a
    // different phase and hop it at the end. Anchored here, every frame paints
    // the picture exactly as the landing frame will, and the last step has
    // nowhere to jump. 1.25x screens step 0.8px; a row is ~300 of them.
    const step = 1 / (window.devicePixelRatio || 1);
    const onDevicePixels = (value, anchor) =>
      Number((anchor + Math.round((value - anchor) / step) * step).toFixed(3));
    // A point on the way: snapped to the destination's grid, then held between
    // the two cards, so a rounding step can never put the panel past the card it
    // started on.
    const onPath = (from, to, eased) => {
      const value = onDevicePixels(from + (to - from) * eased, to);
      return Math.min(Math.max(value, Math.min(from, to)), Math.max(from, to));
    };
    const start = performance.now();
    const duration = 240;
    const frame = (now) => {
      // Clamped at zero: the first callback's timestamp can predate the
      // requestAnimationFrame call that scheduled it, because the frame was
      // already under way when the panel asked to be moved. Left raw, t went
      // negative, the curve below went negative with it, and the panel ran
      // *past* its start — 22px above the card on a row-to-row slide, then back
      // down to it. That lurch is the artwork appearing to shift up and down.
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      if (t >= 1) {
        preview.style.left = `${left}px`;
        if (dy) preview.style.top = `${top}px`;
        preview.style.transform = '';
        travelFrame = 0;
        return;
      }
      // Ease-out, the curve the rest of the page moves on.
      const eased = 1 - (1 - t) ** 3;
      // Snapped toward zero — the destination — so every frame is a whole
      // device-pixel offset of an already painted layer.
      preview.style.transform = `translate3d(${onPath(dx, 0, eased)}px, ${dy ? onPath(dy, 0, eased) : 0}px, 0)`;
      travelFrame = requestAnimationFrame(frame);
    };
    travelFrame = requestAnimationFrame(frame);
    return;
  };

  const closePreview = () => {
    // Called on every frame of any scroll (a capturing scroll listener below),
    // so a closed panel is a no-op rather than three removals, a class change
    // and a trailer teardown per frame.
    if (preview.hidden && !hoveredCard && !travelFrame) return;
    clearTimeout(hideTimer);
    // A close mid-travel would otherwise leave the step loop writing positions
    // into a hidden panel, and the next open would resume from wherever it got
    // to rather than from the card.
    cancelAnimationFrame(travelFrame);
    travelFrame = 0;
    // Removing the frame is what actually stops playback.
    stopTrailer();
    // And the panel keeps no picture of its own: a hidden full-size image is a
    // decoded bitmap nobody can see. The name it would be asked for again is on
    // the card, so reopening costs one lookup in this session's cache.
    previewArt.removeAttribute('src');
    previewArt.removeAttribute('srcset');
    previewArt.removeAttribute('sizes');
    preview.classList.remove('is-open');
    preview.hidden = true;
    preview.style.transform = '';
    preview.style.willChange = '';
    if (hoveredRow) hoveredRow.classList.remove('is-active');
    hoveredCard = null;
    hoveredRow = null;
  };

  const hidePreview = (delay = 90) => {
    if (preview.hidden && !hoveredCard) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(closePreview, delay);
  };

  // A card at a row's edge that shows only a sliver of itself is not a target:
  // the pointer resolves to the card inwards from it, which is the one carrying
  // the paging arrow. A quarter of the card is the line — below that it is a
  // hint that the row continues, not something you can meaningfully hover.
  const SLIVER = 0.25;

  const cardAt = (card, step) => {
    let node = card;
    for (;;) {
      node = step > 0 ? node.nextElementSibling : node.previousElementSibling;
      if (!node) return null;
      if (node.classList.contains('card')) return node;
    }
  };

  const resolveHover = (card) => {
    const viewport = card.closest('.row__viewport');
    if (!viewport) return card;
    const frame = viewport.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    if (!box.width) return card;
    const shown = Math.min(box.right, frame.right) - Math.max(box.left, frame.left);
    if (shown > box.width * SLIVER) return card;
    // Inwards is towards the middle of the row, whichever edge clipped it.
    const inward = box.left < frame.left ? cardAt(card, 1) : cardAt(card, -1);
    return inward || card;
  };

  // A card hovered before its details arrived: remembered so the panel can open
  // the moment they land, if the pointer is still on it.
  let hoverPending = null;

  const showPreview = (target) => {
    // A pull in flight re-creates cards under the pointer; opening the panel
    // then would anchor it to a card that is already sliding away.
    if (document.body.classList.contains('is-row-dragging')) return;
    const card = resolveHover(target);
    const item = card.__item;
    // Bundled demo cards carry no facts, and TMDB does not always answer: those
    // cards simply have no hover card. A card still waiting on its own details
    // asks for them first and opens when they arrive.
    if (!item || !item.facts) {
      if (item && item.deferred) {
        hoverPending = card;
        queueDetails(card, true);
      }
      hidePreview(0);
      return;
    }
    clearTimeout(hideTimer);
    hoveredCard = card;
    const row = card.closest('.row');
    if (hoveredRow && hoveredRow !== row) hoveredRow.classList.remove('is-active');
    hoveredRow = row;
    // The page-level pull driver reads the row off the panel it started on.
    preview.__row = row;
    // The row's pager is the only pager, so it has to draw over the open panel.
    // Lifting the row itself would put its cards over the panel too, so the
    // class raises just that row's two arrows.
    row.classList.add('is-active');
    paintPreview(card);
    preview.hidden = false;
    placePreview(card);
    requestAnimationFrame(() => preview.classList.add('is-open'));
  };

  // Delegated: cards are created and destroyed as a row scrolls, so a listener
  // per card would have to be rebuilt with every window shift.
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const card = event.target.closest('.card');
    if (card) {
      // Compare the resolved card: a sliver resolves to its neighbour, and the
      // pointer sitting on that sliver must not re-open the same panel.
      if (resolveHover(card) !== hoveredCard) showPreview(card);
    } else if (event.target.closest('#card-preview')) {
      clearTimeout(hideTimer);
    }
  });

  document.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    const from = event.target.closest?.(HOVER_CHAIN);
    if (!from) return;
    // Card → panel, panel → card and either → pager all keep it open.
    if (event.relatedTarget?.closest?.(HOVER_CHAIN)) return;
    hidePreview();
  });

  // A row scrolling re-creates the cards under the pointer, and a resize moves
  // every card: the panel would be pointing at nothing.
  // Scrolling moves the page under a pointer that never moves, and the browser
  // fires no pointerover when a new card lands beneath it — so a page scrolled
  // with the wheel arrives with nothing hovered. Remember where the pointer is
  // and, once the movement stops, treat whatever is under it as its target.
  let pointerAt = null;   // last seen position, null once the pointer leaves
  document.addEventListener('pointermove', (event) => {
    pointerAt = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerAt = null; });

  let landTimer = 0;
  const landOnPointer = () => {
    clearTimeout(landTimer);
    landTimer = setTimeout(() => {
      if (!pointerAt || pointerAt.touch) return;
      if (document.body.classList.contains('is-row-dragging')) return;
      // A pointer sitting on the window's edge reports coordinates outside it.
      const x = Math.min(Math.max(pointerAt.x, 0), window.innerWidth - 1);
      const y = Math.min(Math.max(pointerAt.y, 0), window.innerHeight - 1);
      const under = document.elementFromPoint(x, y);
      if (!under) return;
      const card = under.closest('.card');
      if (card) {
        if (resolveHover(card) !== hoveredCard) showPreview(card);
        return;
      }
      // The page moved out from under the panel: it closes like any other leave.
      if (!under.closest(HOVER_CHAIN)) hidePreview(0);
    }, 90);
  };

  window.addEventListener('scroll', () => hidePreview(0), true);
  window.addEventListener('scroll', landOnPointer, true);
  window.addEventListener('resize', () => hidePreview(0));
  window.addEventListener('resize', landOnPointer);

  previewList.addEventListener('click', () => {
    if (!hoveredCard) return;
    const item = hoveredCard.__item;
    const key = `${item.media}:${item.id}`;
    if (myList.has(key)) myList.delete(key);
    else myList.add(key);
    paintPreview(hoveredCard);
  });

  // One stage of the catalogue the page built: the first screen, then the
  // shelves under it. Both arrive whole, so each one replaces what is painted.
  const acceptLine = (data) => {
    if (data.error) {
      console.info('[streamflix] catalogue stopped early —', data.error);
      reveal();
      return;
    }
    applyCatalog(data);
    // The cards just painted start their detail lookups at once, in the middle
    // of the catalogue rather than after it. Each shelf is one request per
    // title, so running them beside the next row's pages is what shortens the
    // first paint; waiting for the last stage and then asking for all of them
    // spent the catalogue's own time and the details' time one after the other.
    dressShelves();
    // The last stage is the whole catalogue: every shelf is as long as it will
    // get, so each row can stop holding its stand-in for the real last title.
    // Not now, though — a settle is the row's last title, and the loader is
    // waiting on the first ten. It runs with the ordered pass once the page is
    // up. A page that revealed early (the guard) has no ordered pass to wait
    // for, so those rows settle at once.
    if (!data.partial) {
      rowModels.forEach((model, row) => {
        if (revealed) model.settle?.();
        else lateSettles.set(row.dataset.section, () => model.settle?.());
      });
    }
    // Only the last stage lifts the loader. The first one carries a single shelf
    // and the billboard; showing the page on it is what put the reader in front
    // of a screen that filled in shelf by shelf, card by card. Every stage stays
    // behind the wheel until the catalogue is whole and its screenful is dressed.
    if (!data.partial) revealWhenArtReady();
  };

  // The catalogue is built in the page: two stages — the first screen, then the
  // shelves under it — handed to the painter the stream used to feed.
  const startCatalogue = () => {
    if (!window.catalogue) {
      // No key is a normal state, not a crash: the page says what is missing
      // instead of sitting behind its wheel.
      document.body.classList.add('is-unconfigured');
      document.body.classList.remove('is-hero-pending', 'is-rows-pending');
      reveal();
      return;
    }
    // The loader waits on the gate shelves, so a request that never answers must
    // not hold it forever: a dropped connection is not a catalogue, and the page
    // shows what painted rather than sitting behind its wheel.
    const guard = setTimeout(() => { if (!revealed) reveal(); }, 25000);
    // The last three visible shelves are handed over as `lateRows`: the
    // catalogue leaves them empty and the ordered pass seeds them after the
    // page is up.
    window.catalogue.catalogue(acceptLine, { gate: GATE_TITLES, lateRows: [...LATE_ROWS] })
      .then((more) => {
        catalogueMore = more;
        clearTimeout(guard);
        if (!artPending) reveal();
        // A page the guard lifted early (or a catalogue that took longer than
        // its first ten to hand over) still gets the rest of its rows, behind
        // the page that is already up.
        else if (revealed) startGrowth(settleLate);
      })
      .catch((error) => {
        clearTimeout(guard);
        console.info('[streamflix] catalogue failed —', error.message);
        // A failure after the billboard has painted is not a missing key: the
        // page shows the shelves it has instead of the setup notice over a
        // catalogue that is already on screen behind the loader.
        if (heroPending) document.body.classList.add('is-unconfigured');
        document.body.classList.remove('is-hero-pending', 'is-rows-pending');
        reveal();
      });
  };

  startCatalogue();

  // ── See all ───────────────────────────────────────────────────────────
  // A row carries the first ROW_COUNT titles of its list; this shows the whole
  // of it as a grid. The heading and the section name come from the row that
  // opened it, and every card is the same one the rows paint, so the hover panel
  // works here without a second path.
  // See all is a grid that keeps itself going: it opens with a batch big enough
  // to fill the window, preloads the next one while that is still being read,
  // and merges the preload in when the bottom of the grid comes into reach.
  // There is no button and no last page — the list is walked until TMDB has
  // nothing left, and the end of it says so.
  const SEE_ALL_FIRST = 40;   // what the grid opens with: four rows at 1600
  const SEE_ALL_CHUNK = 20;   // one TMDB page, merged in as the end comes into reach
  // How far past the grid the reading goes: five batches, so a scroll always has
  // cards waiting, and no further — a reader who stops scrolling is not paying for
  // a list they never reach (about 6 MB of pictures at the sizes used here).
  const SEE_ALL_LOOKAHEAD = 100;
  const SEE_ALL_OPEN_MS = 12000;  // the open wheel's ceiling: it covers a lookup
  const seeAll = document.getElementById('see-all');
  const seeAllTitle = document.getElementById('see-all-title');
  const seeAllGrid = document.getElementById('see-all-grid');
  const seeAllMoreWrap = document.getElementById('see-all-more-wrap');
  const seeAllEndNote = document.getElementById('see-all-end');
  const seeAllEmpty = document.getElementById('see-all-empty');
  // How long one batch of the grid waits for its pictures before the next one is
  // read. The page's own reveal may wait much longer (ART_WAIT_MS) because it is
  // the one moment the reader is promised a dressed screen; a grid is read as it
  // goes, and a batch that holds the next one up for fifteen seconds is a wall
  // the reader hits at the bottom of every screenful.
  const GRID_WAIT_MS = 4000;

  const seeAllState = {
    section: '', offset: 0, hasMore: true, busy: false,
    queue: [], fetching: false, inflight: null, scrolled: false, done: false,
    merging: false, seen: new Set(), waitFrom: 0,
    pending: new Set(), pendingFrom: 0,
    // Which read of the row this is. Every open, and every cut on it, starts a
    // new one: a batch asked for under the old choices is dropped when it lands
    // rather than merged into a grid it no longer belongs to.
    gen: 0
  };

  // ── The bar's filters ─────────────────────────────────────────────────
  // The grid opens on the row's own order and never leaves it: a cut only keeps
  // or drops the titles the row is reading, so nothing about the default view
  // changes when the bar is left be. The choices are sets of things a title
  // answers by itself — genres to keep, genres to drop, years — which is what
  // lets the server cut the row as it walks it instead of reading it all first.
  const seeAllTools = document.getElementById('see-all-tools');
  const seeAllPanel = document.getElementById('see-all-panel');
  const seeAllType = document.getElementById('see-all-type');
  const seeAllReset = document.getElementById('see-all-reset');
  const FILTER_LABELS = { genres: 'Genres', exclude: 'Exclude', years: 'Year' };
  // Released, in cinemas, not out yet — the three kinds of content a page can
  // show. All three is where it starts, so the page shows everything.
  const RELEASE_ALL = ['released', 'theaters', 'unreleased'];
  // The orders the bar offers. Nothing chosen is the page's own default: the most
  // popular titles of all time, which is the ranking it opens on.
  const SORT_LABELS = {
    '': 'Most popular', rated: 'Top rated', newest: 'Newest',
    oldest: 'Oldest', az: 'A–Z', za: 'Z–A',
  };
  const seeAllFilters = {
    type: '', genres: new Set(), exclude: new Set(), years: new Set(), score: '',
    sort: '', release: new Set(RELEASE_ALL),
  };
  let seeAllMeta = null;         // /api/filters answer for the open section
  let seeAllMetaSection = '';
  let seeAllMetaTried = '';
  let seeAllOpenTitle = '';
  let filterTool = '';
  let filterApplyTimer = 0;
  // The two timers the grid runs on: one for the next window of a list, one for
  // a page that came back with nothing to paint yet.
  let moreTimer = 0;
  let pendingTimer = 0;

  const seeAllClearFilters = () => {
    seeAllFilters.type = '';
    seeAllFilters.genres.clear();
    seeAllFilters.exclude.clear();
    seeAllFilters.years.clear();
    seeAllFilters.score = '';
    seeAllFilters.sort = '';
    seeAllFilters.release.clear();
    RELEASE_ALL.forEach((state) => seeAllFilters.release.add(state));
  };

  // Both kinds is where a mixed row starts, so asking for one of them is a cut;
  // leaving it on Both is the row as it comes.
  const seeAllFiltered = () => Boolean(
    seeAllFilters.genres.size || seeAllFilters.exclude.size
    || seeAllFilters.years.size || seeAllFilters.score
    || seeAllFilters.type || seeAllFilters.sort
    || seeAllFilters.release.size < RELEASE_ALL.length
  );

  const seeAllFilterQuery = () => {
    const parts = new URLSearchParams();
    if (seeAllFilters.type) parts.set('type', seeAllFilters.type);
    if (seeAllFilters.genres.size) parts.set('genres', [...seeAllFilters.genres].join(','));
    if (seeAllFilters.exclude.size) parts.set('exclude', [...seeAllFilters.exclude].join(','));
    if (seeAllFilters.years.size) parts.set('years', [...seeAllFilters.years].join(','));
    if (seeAllFilters.score) parts.set('score', seeAllFilters.score);
    if (seeAllFilters.sort) parts.set('sort', seeAllFilters.sort);
    // All three is not a cut, so it is not asked for either.
    if (seeAllFilters.release.size < RELEASE_ALL.length) {
      parts.set('release', [...seeAllFilters.release].join(','));
    }
    return parts.toString();
  };

  const filterConfig = () => {
    const meta = seeAllMeta;
    if (!meta) return null;
    // On a row of both kinds, a genre has to be one name over two id sets, so the
    // list offered is the two read together; a row of one kind uses its own.
    const media = seeAllFilters.type || (meta.mixed ? 'both' : meta.media);
    const genres = (meta.genres[media] || []).map((genre) => ({ id: String(genre.id), label: genre.name }));
    return {
      genres: { title: 'Genres', hint: 'Only titles in these', options: genres, set: seeAllFilters.genres },
      exclude: { title: 'Genres left out', hint: 'Everything but these', options: genres, set: seeAllFilters.exclude },
      years: { title: 'Release year', hint: 'Any of these years', options: meta.years.map((year) => ({ id: year, label: year })), set: seeAllFilters.years },
      score: { title: 'Minimum score', hint: `Anything rated at least this, by ${meta.score.votes} people or more`, range: meta.score },
      release: {
        title: 'Release',
        hint: 'What the page may show',
        options: RELEASE_ALL.map((state) => ({ id: state, label: RELEASE_LABELS[state] })),
        set: seeAllFilters.release,
        keep: RELEASE_ALL,
      },
      sort: {
        title: 'Sort by',
        hint: 'The order the page reads in',
        choices: Object.entries(SORT_LABELS).map(([id, label]) => ({ id, label })),
        value: () => seeAllFilters.sort,
        pick: (id) => { seeAllFilters.sort = id; },
      },
    };
  };

  const syncFilterButtons = () => {
    // Reset keeps its place either way: it goes quiet when there is no cut to
    // undo, rather than appearing and pushing every pill beside it along.
    seeAllReset.disabled = !seeAllFiltered();
    const meta = seeAllMeta;
    if (!meta) return;
    const counts = {
      genres: seeAllFilters.genres.size,
      exclude: seeAllFilters.exclude.size,
      years: seeAllFilters.years.size,
    };
    seeAllTools.querySelectorAll('.tool[data-tool]').forEach((button) => {
      const tool = button.dataset.tool;
      if (tool === 'score') {
        const chosen = Number(seeAllFilters.score || 0);
        button.textContent = chosen ? `Score ${chosen.toFixed(1)}+` : 'Score';
        button.classList.toggle('is-on', chosen > 0);
        return;
      }
      if (tool === 'sort') {
        const sort = seeAllFilters.sort;
        button.textContent = sort ? `Sort · ${SORT_LABELS[sort]}` : 'Sort';
        button.classList.toggle('is-on', Boolean(sort));
        return;
      }
      if (tool === 'release') {
        const kept = seeAllFilters.release.size;
        button.textContent = kept === RELEASE_ALL.length ? 'Release' : `Release · ${kept}`;
        button.classList.toggle('is-on', kept < RELEASE_ALL.length);
        return;
      }
      const count = counts[tool] || 0;
      button.textContent = count ? `${FILTER_LABELS[tool]} · ${count}` : FILTER_LABELS[tool];
      button.classList.toggle('is-on', count > 0);
    });
    const chosen = seeAllFilters.type || '';
    seeAllType.querySelectorAll('[data-type]').forEach((button) => {
      button.classList.toggle('is-on', (button.dataset.type || '') === chosen);
    });
  };

  // The pill in the search field is the page's tray seen from the top bar: it is
  // lit while the tray on the search page is open, and dark the rest of the time.
  const syncSearchFilter = () => {
    const on = !seeAllPanel.hidden && seeAllState.section === 'search';
    searchFilter.setAttribute('aria-expanded', String(on));
  };

  const seeAllClosePanel = () => {
    if (seeAllPanel.hidden) return;
    seeAllPanel.hidden = true;
    filterTool = '';
    seeAllTools.querySelectorAll('.tool[data-tool]').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
    syncSearchFilter();
  };

  // The score is a slider rather than a row of rungs: "about an eight" is a
  // place on a scale, not one of six answers, and a reader can put it on 7.6. A
  // drag asks for nothing until it pauses, and 0 is the cut switched off.
  const scoreControl = (range) => {
    const wrap = document.createElement('div');
    wrap.className = 'filter__score';
    const top = document.createElement('div');
    top.className = 'filter__score-top';
    const value = document.createElement('span');
    value.className = 'filter__score-value';
    const scale = document.createElement('span');
    scale.className = 'filter__score-scale';
    scale.textContent = `${range.min} to ${range.max}`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'filter__range';
    slider.min = String(range.min);
    slider.max = String(range.max);
    slider.step = String(range.step);
    slider.value = String(Number(seeAllFilters.score || range.min));
    slider.setAttribute('aria-label', 'Minimum score');
    const paint = () => {
      const chosen = Number(seeAllFilters.score || 0);
      value.textContent = chosen ? `${chosen.toFixed(1)}+` : 'Off';
    };
    slider.addEventListener('input', () => {
      const next = Number(slider.value);
      seeAllFilters.score = next > Number(range.min) ? next.toFixed(1) : '';
      paint();
      syncFilterButtons();
      seeAllApplySoon();
    });
    paint();
    top.append(value, scale);
    wrap.append(top, slider);
    return wrap;
  };

  // The tray opens to exactly as tall as what it holds, capped at the same ceiling
  // the stylesheet uses. Without this the slide would reach the content's height in
  // its first frames and the rest of the animation would have nothing to move.
  const seeAllTrayHeight = () => {
    const limit = Math.min(window.innerHeight * 0.56, 430);
    seeAllPanel.style.setProperty('--tray-h', `${Math.min(seeAllPanel.scrollHeight, limit)}px`);
  };

  const seeAllRenderPanel = (tool) => {
    const config = (filterConfig() || {})[tool];
    if (!config) return;
    filterTool = tool;
    seeAllPanel.replaceChildren();
    const title = document.createElement('p');
    title.className = 'filter__title';
    title.textContent = config.title;
    seeAllPanel.append(title);
    if (config.hint) {
      const hint = document.createElement('p');
      hint.className = 'filter__hint';
      hint.textContent = config.hint;
      seeAllPanel.append(hint);
    }
    if (config.choices) {
      const group = document.createElement('div');
      group.className = 'filter__choices';
      config.choices.forEach((choice) => {
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'filter__choice';
        pick.textContent = choice.label;
        const on = choice.id === config.value();
        pick.classList.toggle('is-on', on);
        pick.setAttribute('aria-pressed', String(on));
        pick.addEventListener('click', () => {
          if (config.value() === choice.id) return;
          config.pick(choice.id);
          seeAllRenderPanel(tool);
          syncFilterButtons();
          seeAllApplySoon();
        });
        group.append(pick);
      });
      seeAllPanel.append(group);
      seeAllTools.querySelectorAll('.tool[data-tool]').forEach((button) => {
        button.setAttribute('aria-expanded', String(button.dataset.tool === tool));
      });
      seeAllPanel.hidden = false;
      seeAllTrayHeight();
      syncSearchFilter();
      return;
    }
    if (config.range) {
      seeAllPanel.append(scoreControl(config.range));
      seeAllTools.querySelectorAll('.tool[data-tool]').forEach((button) => {
        button.setAttribute('aria-expanded', String(button.dataset.tool === tool));
      });
      seeAllPanel.hidden = false;
      seeAllTrayHeight();
      syncSearchFilter();
      return;
    }
    const list = document.createElement('div');
    list.className = 'filter__list';
    config.options.forEach((option) => {
      const row = document.createElement('label');
      row.className = 'filter__option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = `see-all-${tool}`;
      input.value = option.id;
      input.checked = config.set.has(option.id);
      const mark = document.createElement('span');
      mark.className = 'filter__mark';
      const text = document.createElement('span');
      text.className = 'filter__label';
      text.textContent = option.label;
      row.append(input, mark, text);
      list.append(row);
    });
    seeAllPanel.append(list);
    const chosen = config.set.size > 0;
    if (chosen) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'filter__clear';
      clear.textContent = 'Clear these';
      clear.addEventListener('click', () => {
        config.set.clear();
        // A release page with nothing allowed would be a page with nothing on
        // it: clearing that one means putting the three kinds back.
        (config.keep || []).forEach((id) => config.set.add(id));
        seeAllRenderPanel(tool);
        syncFilterButtons();
        seeAllApplySoon();
      });
      seeAllPanel.append(clear);
    }
    seeAllTools.querySelectorAll('.tool[data-tool]').forEach((button) => {
      button.setAttribute('aria-expanded', String(button.dataset.tool === tool));
    });
    seeAllPanel.hidden = false;
    seeAllTrayHeight();
    syncSearchFilter();
  };

  // A cut lands a moment after the last click: ticking four genres should be one
  // read of the list, not four.
  const seeAllApplySoon = () => {
    clearTimeout(filterApplyTimer);
    filterApplyTimer = setTimeout(() => {
      syncFilterButtons();
      if (!seeAllState.section) return;
      openSeeAll(seeAllState.section, seeAllOpenTitle, true);
    }, 220);
  };

  const seeAllLoadMeta = async () => {
    // Continue Watching is the page's own ten, not a catalogue list: there is
    // nothing for genres or years to cut, so it opens without the filter bar.
    if (!window.catalogue || seeAllState.section === 'continue-watching') return null;
    const section = seeAllState.section;
    if (seeAllMeta && seeAllMetaSection === section) return seeAllMeta;
    if (seeAllMetaTried === section) return null;
    seeAllMetaTried = section;
    try {
      const payload = await window.catalogue.filters(section);
      if (!payload.configured || seeAllState.section !== section) return null;
      seeAllMeta = payload;
      seeAllMetaSection = section;
      seeAllTools.hidden = false;
      seeAllType.hidden = !payload.mixed;
      syncFilterButtons();
      return payload;
    } catch (error) {
      return null;
    }
  };

  seeAllPanel.addEventListener('change', (event) => {
    const input = event.target.closest('input[value]');
    const config = (filterConfig() || {})[filterTool];
    if (!input || !config) return;
    if (input.checked) config.set.add(input.value);
    else config.set.delete(input.value);
    if (config.keep && !config.set.size) config.keep.forEach((id) => config.set.add(id));
    syncFilterButtons();
    seeAllApplySoon();
  });

  seeAllTools.addEventListener('click', (event) => {
    const kind = event.target.closest('[data-type]');
    if (kind) {
      const next = kind.dataset.type || '';
      if (next === seeAllFilters.type) return;
      seeAllFilters.type = next;
      // Genre ids belong to one kind or the other: Action is a film genre,
      // Action & Adventure a series one, so the cuts made for one do not carry
      // across to the other.
      seeAllFilters.genres.clear();
      seeAllFilters.exclude.clear();
      if (!seeAllPanel.hidden && filterTool !== 'years' && filterTool !== 'score') {
        seeAllRenderPanel(filterTool);
      }
      syncFilterButtons();
      seeAllApplySoon();
      return;
    }
    const tool = event.target.closest('.tool[data-tool]');
    if (!tool) return;
    if (!seeAllPanel.hidden && filterTool === tool.dataset.tool) {
      seeAllClosePanel();
      return;
    }
    seeAllRenderPanel(tool.dataset.tool);
  });

  seeAllReset.addEventListener('click', () => {
    seeAllClearFilters();
    seeAllClosePanel();
    syncFilterButtons();
    if (seeAllState.section) openSeeAll(seeAllState.section, seeAllOpenTitle, true);
  });

  document.addEventListener('click', (event) => {
    if (seeAllPanel.hidden) return;
    // The pill in the search field is the tray's own switch, so a press on it is
    // not a press somewhere else: without this the tray would open and shut in
    // the same click.
    if (event.target.closest('#see-all-panel, #see-all-tools, #search-filter')) return;
    seeAllClosePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') seeAllClosePanel();
  });

  // The bar sticks under the app bar, whose height is measured rather than
  // guessed: it changes with the window's width and the account pill in it.
  const topbarEl = document.querySelector('.topbar');
  const syncTopbarHeight = () => {
    const height = topbarEl ? Math.round(topbarEl.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--topbar-h', `${height}px`);
  };
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);

  // A card in the grid is dressed in two steps: the section list gives it its
  // still and its place, and its details give it the cover with the title on it.
  // Until that second step lands a card is either the wrong picture or an empty
  // frame, which is what the grid used to show while it filled. So the wheel
  // holds the grid back until its cards have their covers.
  const covered = (card) => {
    // Only what is on the screen is waited for. A card below the fold keeps the
    // list page's still until it is looked at — that is how the art schedule has
    // always worked — so waiting on one would be waiting for a scroll that may
    // never come.
    const box = card.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= (window.innerHeight || 1)) return true;
    const image = card.querySelector('img');
    const item = card.__item;
    if (!image || !item) return true;
    // A cover that cannot be fetched is not one to wait on for ever.
    if (image.dataset.dead || Number(image.dataset.tries || 0) >= ART_TRIES) return true;
    const src = image.getAttribute('src');
    // The titled file, at whichever size the card was given: one below the fold
    // holds the half-size copy until it is looked at, and that is the same
    // cover. A card still painted with the still it was built from has neither,
    // which is the state worth waiting through. A textless title has no separate
    // cover, so the file it came with is the one that counts, and a card whose
    // details came back empty is dressed as far as it will ever be.
    const dressed = Boolean(item.facts) || !item.deferred;
    return dressed && src
      && (src === image.dataset.full || src === image.dataset.low)
      && image.complete && image.naturalWidth > 0;
  };

  let seeAllTimer = 0;
  const seeAllWheel = (on, veil = false, limit = ART_WAIT_MS) => {
    clearTimeout(seeAllTimer);
    seeAllTimer = 0;
    seeAll.classList.toggle('is-waiting', on);
    seeAll.classList.toggle('is-veiled', on && veil);
    if (!on) {
      // Lifting the wheel is the first moment the grid can be measured in full.
      setTimeout(seeAllCheck, 120);
      return;
    }
    // As long as the page itself waits for artwork, and no longer: a cover that
    // never arrives leaves the grid readable rather than behind a wheel that
    // never stops.
    const started = performance.now();
    const step = () => {
      seeAllTimer = 0;
      if (!document.body.classList.contains('is-seeing-all')) return;
      const cards = [...seeAllGrid.querySelectorAll('.card')];
      // Still on the wire with nothing to measure yet.
      const pending = !cards.length ? seeAllState.busy : cards.some((card) => !covered(card));
      if (!pending || performance.now() - started > limit) {
        seeAllWheel(false);
        return;
      }
      seeAllTimer = setTimeout(step, 90);
    };
    seeAllTimer = setTimeout(step, 90);
  };

  // The width one grid card actually occupies, read off the grid's own used
  // columns rather than assumed: the artwork is fetched at the size of the slot,
  // so a six-across window does not pay for the same file as a three-across one.
  // Before the grid has been laid out the token card is the honest answer.
  const seeAllCardWidth = () => {
    const first = parseFloat(getComputedStyle(seeAllGrid).gridTemplateColumns);
    if (first > 1) return first;
    const card = seeAllGrid.querySelector('.card');
    const measured = card ? card.getBoundingClientRect().width : 0;
    return measured > 1 ? measured : 250;
  };

  // The default grid is the section's own walk; a grid with cuts on it is that
  // same list re-read through the filter endpoint, which keeps or drops each
  // title by what that title already carries as the row is walked.
  const seeAllQuery = async (section, offset, limit) => {
    if (!window.catalogue) return null;
    // Continue Watching is the row itself: ten titles on the page, with no
    // catalogue feed behind them. Its grid is those ten, and that is the end of
    // the list — there is no page to fetch for the row that has no source.
    if (section === 'continue-watching') {
      const items = rowItems.get(section) || [];
      return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit };
    }
    const filtered = seeAllFiltered() || section === 'search';
    try {
      // A search is its own list: the bar's cuts are not on it, and the query
      // is what stands where a row's name would.
      if (filtered) {
        const params = window.catalogue.readParams(new URLSearchParams(seeAllFilterQuery()));
        params.query = section === 'search' ? searchText : '';
        return await window.catalogue.filter(section, offset, limit, params);
      }
      return await window.catalogue.section(section, offset, limit);
    } catch (error) {
      return null;
    }
  };

  const seeAllWarm = async (items) => {
    const pending = items.filter((item) => item && !item.facts);
    const chunks = [];
    for (let i = 0; i < pending.length; i += DETAILS_BATCH) {
      chunks.push(pending.slice(i, i + DETAILS_BATCH));
    }
    // Asked for together rather than one after the other: forty titles are two
    // requests, and the wheel is up for as long as the slower of them.
    await Promise.all(chunks.map((chunk) => (
      requestDetails([...new Set(chunk.map(detailKey))], chunk)
    )));
  };

  const seeAllPaint = (items) => {
    const cardW = seeAllCardWidth();
    const base = seeAllGrid.querySelectorAll('.card').length;
    const added = [];
    for (const item of items) {
      // A title can reach the grid twice: a window served from a fresh walk
      // before the session's row exists does not hold the same titles in the same
      // places as the row that answers the next window. The repeat is dropped
      // rather than given a second card and a second number.
      const key = `${item.media}:${item.id}`;
      if (seeAllState.seen.has(key)) continue;
      seeAllState.seen.add(key);
      const card = buildCard(item, cardW, base + added.length + 1);
      added.push(card);
      seeAllGrid.append(card);
    }
    // The cursor moves by what the window held, not by what survived the drop:
    // asking for the same window again would only find the same repeats.
    seeAllState.offset += items.length;
    // The batch just painted is what the next merge waits for.
    added.forEach((card) => seeAllState.pending.add(card));
    seeAllState.pendingFrom = performance.now();
    if (added.length) {
      // New cards, so the schedule has something new to ask for. They come from
      // the section list, which carries no facts, and the art schedule leaves a
      // card without them until its details land — so the details pass is asked
      // for too. It collects the grid alongside the shelves, and without it every
      // card here waited for a lookup nothing had asked for.
      scheduleArt();
      scheduleDetails();
    }
    return added;
  };

  const seeAllDone = () => {
    if (seeAllState.done) return;
    seeAllState.done = true;
    clearTimeout(moreTimer);
    moreTimer = 0;
    // A search with no card on the grid found nothing: that is the page's answer,
    // not the end of a list, so the slot goes and the line takes its place.
    if (seeAllState.section === 'search' && !seeAllGrid.querySelector('.card')) {
      seeAllMoreWrap.hidden = true;
      seeAllMoreWrap.classList.remove('is-waiting');
      seeAllEmpty.hidden = false;
      seeAllWheel(false);
      return;
    }
    seeAllMoreWrap.hidden = false;
    seeAllMoreWrap.classList.remove('is-waiting');
    seeAllEndNote.hidden = false;
  };

  const seeAllWaiting = (on) => {
    clearTimeout(moreTimer);
    moreTimer = 0;
    seeAllMoreWrap.hidden = false;
    seeAllMoreWrap.classList.toggle('is-waiting', on);
  };

  const seeAllPreload = () => {
    if (seeAllState.done || !seeAllState.hasMore) return;
    if (seeAllState.fetching || seeAllQueued() >= SEE_ALL_LOOKAHEAD) return;
    const section = seeAllState.section;
    const gen = seeAllState.gen;
    // Behind whatever is already queued, not behind what is painted.
    const offset = seeAllState.offset + seeAllQueued();
    seeAllState.fetching = true;
    seeAllState.inflight = seeAllQuery(section, offset, SEE_ALL_CHUNK).then(async (batch) => {
      seeAllState.fetching = false;
      seeAllState.inflight = null;
      if (!batch || seeAllState.gen !== gen || seeAllState.section !== section) return null;
      await seeAllWarm(batch.items);
      if (seeAllState.gen !== gen || seeAllState.section !== section) return null;
      // The row's end is known as soon as a batch says so, even before it is
      // painted: nothing more is read ahead of it.
      if (!batch.hasMore) seeAllState.hasMore = false;
      if (batch.items.length) seeAllState.queue.push(batch);
      const width = seeAllCardWidth();
      for (const item of batch.items) {
        const url = artFor(item.still, width, ART_RING_SCALE);
        if (!url) continue;
        const warm = new Image();
        warm.src = url;
      }
      // Fill the window behind this one.
      seeAllPreload();
      return batch;
    });
  };

  const seeAllRowsReady = () => {
    if (!document.body.classList.contains('is-rows-pending')) return Promise.resolve();
    return new Promise((done) => {
      const watch = new MutationObserver(() => {
        if (document.body.classList.contains('is-rows-pending')) return;
        watch.disconnect();
        done();
      });
      watch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => {
        watch.disconnect();
        done();
      }, 9000);
    });
  };

  const seeAllQueued = () => seeAllState.queue.reduce(
    (total, batch) => total + batch.items.length, 0
  );

  const seeAllBatchPending = () => {
    let pending = false;
    for (const card of seeAllState.pending) {
      if (!card.isConnected) {
        seeAllState.pending.delete(card);
        continue;
      }
      const image = card.querySelector('img');
      if (!image || image.dataset.dead) continue;
      if (!image.getAttribute('src')) {
        pending = true;
        break;
      }
    }
    if (!pending) {
      seeAllState.pending.clear();
      return false;
    }
    if (performance.now() - seeAllState.pendingFrom > GRID_WAIT_MS) {
      seeAllState.pending.clear();
      return false;
    }
    return true;
  };

  const waitForCold = (then) => {
    clearTimeout(moreTimer);
    moreTimer = 0;
    seeAllMoreWrap.hidden = false;
    if (!seeAllMoreWrap.classList.contains('is-waiting')) {
      seeAllMoreWrap.classList.add('is-waiting');
      // One wait per run of batches: a stream of merges cannot hold the wheel up
      // past the same ceiling a single one is given.
      seeAllState.waitFrom = performance.now();
    }
    const step = () => {
      moreTimer = 0;
      if (!document.body.classList.contains('is-seeing-all')) return;
      // The wheel is up for as long as the batch on the grid is still finding its
      // pictures. The cards are already in place, dressed one by one as the files
      // land, so there is no hidden stretch under the reader and nothing to wait
      // for before the next batch is read.
      if (!seeAllBatchPending() || performance.now() - seeAllState.waitFrom > GRID_WAIT_MS) {
        seeAllMoreWrap.classList.remove('is-waiting');
        if (then) then();
        // A reader who was already at the bottom when the batch landed is still
        // at the bottom, and the scroll has nothing new to report: ask again.
        setTimeout(seeAllCheck, 120);
        return;
      }
      moreTimer = setTimeout(step, 90);
    };
    moreTimer = setTimeout(step, 90);
  };

  const seeAllMergePage = async () => {
    if (!document.body.classList.contains('is-seeing-all')) return;
    if (seeAllState.busy || seeAllState.done) return;
    const gen = seeAllState.gen;
    // The batch already on the grid is painted before the next one is read: the
    // reader reaches the end of the dressed cards, finds the wheel, and waits for
    // the pictures they already have rather than for more empty ones.
    if (seeAllBatchPending()) {
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(seeAllCheck, 250);
      return;
    }
    const section = seeAllState.section;
    let batch = seeAllState.queue.shift();
    if (!batch && seeAllState.inflight) {
      // Already on its way: wait for that read rather than asking again.
      seeAllWaiting(true);
      seeAllState.busy = true;
      await seeAllState.inflight;
      seeAllState.busy = false;
      if (seeAllState.gen !== gen || seeAllState.section !== section || seeAllState.done) return;
      batch = seeAllState.queue.shift();
    }
    if (!batch) {
      if (!seeAllState.hasMore) {
        seeAllDone();
        return;
      }
      // Read this far before the preload was ready: the slot's wheel is what
      // stands in for the wait.
      seeAllWaiting(true);
      seeAllState.busy = true;
      batch = await seeAllQuery(section, seeAllState.offset, SEE_ALL_CHUNK);
      seeAllState.busy = false;
      // An answer for a section the reader has already left, or for cuts that
      // have since been changed, is dropped.
      if (seeAllState.gen !== gen || seeAllState.section !== section || seeAllState.done) return;
      if (!batch) {
        seeAllWaiting(false);
        return;
      }
    }
    if (!batch.items.length) {
      if (batch.hasMore) {
        // These pages held nothing for the cut and the row goes on: ask for the
        // next ones rather than calling the list finished.
        seeAllState.hasMore = true;
        seeAllWaiting(true);
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(seeAllCheck, 300);
        return;
      }
      seeAllState.hasMore = false;
      seeAllDone();
      return;
    }
    // Facts first, behind the wheel: the batch lands wearing its titled artwork,
    // so no card on the grid appears in one picture and turns into another.
    seeAllWaiting(true);
    await seeAllWarm(batch.items);
    if (seeAllState.gen !== gen || seeAllState.section !== section || seeAllState.done) return;
    seeAllPaint(batch.items);
    seeAllState.hasMore = batch.hasMore;
    // The covers land behind the wheel; the end of the list, if this was the
    // last batch, follows them.
    waitForCold(() => {
      if (!seeAllState.hasMore) seeAllDone();
    });
    seeAllPreload();
  };

  const seeAllMerge = () => {
    if (seeAllState.merging) return Promise.resolve();
    seeAllState.merging = true;
    return seeAllMergePage().finally(() => {
      seeAllState.merging = false;
    });
  };

  const seeAllOpen = async () => {
    const section = seeAllState.section;
    const gen = seeAllState.gen;
    // Busy for the whole of it — the list, its facts and the paint. The open
    // wheel reads that flag while the grid is still empty, so it stays up until
    // there are cards to show.
    seeAllState.busy = true;
    await seeAllRowsReady();
    if (seeAllState.gen !== gen || seeAllState.section !== section) return;
    const batch = await seeAllQuery(section, 0, SEE_ALL_FIRST);
    if (seeAllState.gen !== gen || seeAllState.section !== section) return;
    if (!batch) {
      seeAllState.busy = false;
      // No list to show: rather than a wheel over nothing, the grid stays empty
      // and the slot goes away.
      seeAllWheel(false);
      seeAllMoreWrap.hidden = true;
      return;
    }
    // The titled artwork is fetched before the first card is built, so the grid
    // opens on the cards it will keep.
    await seeAllWarm(batch.items);
    if (seeAllState.gen !== gen || seeAllState.section !== section) return;
    seeAllPaint(batch.items);
    seeAllState.busy = false;
    seeAllState.hasMore = batch.hasMore;
    // The slot has to be in the page from here on: it is what the observer
    // watches to know the bottom has come into reach.
    seeAllMoreWrap.hidden = false;
    if (!batch.items.length) {
      if (batch.hasMore) {
        // Nothing on the pages read so far, and the row is not read out: a narrow
        // cut is not the end of the list. The read goes on behind the slot's
        // wheel, which is what the reader sees until a title turns up.
        seeAllWaiting(true);
        clearTimeout(pendingTimer);
        pendingTimer = setTimeout(seeAllCheck, 300);
        return;
      }
      seeAllDone();
      seeAllWheel(false);
      return;
    }
    if (seeAllState.hasMore) {
      seeAllPreload();
    } else {
      // The whole list was shorter than one batch: say so behind the open wheel,
      // which lifts on its own once the cards are dressed.
      seeAllState.done = true;
      seeAllEndNote.hidden = false;
    }
  };

  // `quiet` is the live re-read a typed query asks for on the search page: the
  // list is the page's own, so it is re-read in place, without jumping the page up
  // under a word still being typed. The wheel it opens with is the same one — the
  // circle is up until the new titles are dressed, which is the whole point of it.
  const openSeeAll = (section, title, keepFilters = false, quiet = false) => {
    if (!section) return;
    closePreview();
    seeAllOpenTitle = title || 'All titles';
    if (!keepFilters) {
      seeAllClearFilters();
      seeAllMeta = null;
      seeAllMetaSection = '';
      seeAllMetaTried = '';
    }
    if (!keepFilters) seeAllClosePanel();
    syncSearchFilter();
    seeAllTools.hidden = !(seeAllMeta && seeAllMetaSection === section);
    if (seeAllMeta && seeAllMetaSection === section) syncFilterButtons();
    else seeAllReset.disabled = true;
    clearTimeout(moreTimer);
    moreTimer = 0;
    clearTimeout(pendingTimer);
    pendingTimer = 0;
    seeAllState.gen += 1;
    seeAllState.section = section;
    seeAllState.offset = 0;
    seeAllState.hasMore = true;
    seeAllState.busy = false;
    seeAllState.queue = [];
    seeAllState.fetching = false;
    seeAllState.inflight = null;
    seeAllState.scrolled = false;
    seeAllState.done = false;
    seeAllState.seen.clear();
    seeAllState.pending.clear();
    seeAllGrid.replaceChildren();
    seeAllTitle.textContent = seeAllOpenTitle;
    seeAllEndNote.hidden = true;
    seeAllEmpty.hidden = true;
    if (section === 'search') {
      // Three ways to reach an empty page: a word and a cut, a word, or the
      // catalogue under cuts that leave nothing. Each says which it is.
      const cuts = seeAllFiltered();
      seeAllEmpty.textContent = searchText
        ? `Nothing matched “${searchText}”${cuts ? ' under these cuts' : ''}. ${cuts ? 'Try fewer of them, or another title.' : 'Try another title.'}`
        : cuts
          ? 'Nothing is left under these cuts. Reset one and the catalogue comes back.'
          : 'Type a title in the search field and press Enter.';
    }
    seeAllMoreWrap.classList.remove('is-waiting');
    seeAllMoreWrap.hidden = true;
    seeAll.hidden = false;
    // Parked before the class hides the shelves: a hidden row measures zero, and
    // a row that measures nothing cannot be told from one at the top of the page.
    parkRowsBelow();
    document.body.classList.add('is-seeing-all');
    seeAllSweepStart();
    if (!quiet) window.scrollTo({ top: 0, behavior: 'instant' });
    // The page's own scrollbar comes and goes with the view, and losing it moves
    // the wordmark under an open field: the room the field may take is re-read
    // here, where the grid's own height has settled.
    if (search.classList.contains('is-open')) sizeSearch();
    // Up before the request goes out: the grid is empty until the first batch
    // lands dressed, and the wheel is what fills that wait.
    seeAllWheel(true, true, SEE_ALL_OPEN_MS);
    seeAllOpen();
    // The bar's own choices arrive behind the first batch: the grid does not
    // wait on them, and a catalogue with no key simply keeps the bar hidden. A
    // search page has the same bar — its genres, years and score cut the
    // catalogue it is reading just as they cut a row.
    seeAllLoadMeta();
  };

  // While the grid is open there is always something worth a fresh look: a card
  // that came into reach without a scroll — a batch merged under the reader — or
  // one whose picture a dropped request never answered. The pass is throttled and
  // costs a query, so asking again on a slow beat is cheaper than a card sitting
  // empty until the reader happens to scroll.
  let seeAllSweep = 0;
  const seeAllSweepStart = () => {
    clearInterval(seeAllSweep);
    seeAllSweep = setInterval(() => {
      if (!document.body.classList.contains('is-seeing-all')) {
        clearInterval(seeAllSweep);
        seeAllSweep = 0;
        return;
      }
      const vh = window.innerHeight || 1;
      const empty = [...seeAllGrid.querySelectorAll('.card')].some((card) => {
        const box = card.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= vh) return false;
        return !card.querySelector('img')?.getAttribute('src');
      });
      if (empty) scheduleArt();
    }, 700);
  };

  const closeSeeAll = () => {
    if (!document.body.classList.contains('is-seeing-all')) return;
    seeAllWheel(false);
    seeAllClosePanel();
    clearTimeout(filterApplyTimer);
    filterApplyTimer = 0;
    clearTimeout(pendingTimer);
    pendingTimer = 0;
    clearInterval(seeAllSweep);
    seeAllSweep = 0;
    clearTimeout(moreTimer);
    moreTimer = 0;
    seeAllMoreWrap.classList.remove('is-waiting');
    seeAllState.section = '';
    seeAllState.queue = [];
    seeAllState.fetching = false;
    seeAllState.inflight = null;
    seeAllState.done = true;
    seeAllState.seen.clear();
    seeAllState.pending.clear();
    document.body.classList.remove('is-seeing-all');
    seeAll.hidden = true;
    seeAllGrid.replaceChildren();
    seeAllEndNote.hidden = true;
    seeAllEmpty.hidden = true;
    syncSearchFilter();
    closePreview();
    // Back on the billboard: paint its slide again, trailer included.
    renderHero(heroIndex);
    window.scrollTo({ top: 0, behavior: 'instant' });
    // The shelves were parked under the grid: the rows the window is showing
    // come back at once, and the rest are woken as the browser goes idle, well
    // before a scroll of a page this short could reach them.
    wakeRowsNearby();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(wakeRows, { timeout: 600 });
    else setTimeout(wakeRows, 180);
  };

  // Whether the bottom of the list has come into reach. The grid's cards take
  // their height from their pictures, so the observer can report the slot in
  // view while the first batch is still settling — an early report would grow
  // the grid before the reader ever asked. Where the slot actually is settles it.
  const seeAllCheck = () => {
    if (!document.body.classList.contains('is-seeing-all')) return;
    if (seeAllMoreWrap.hidden || seeAllState.busy || seeAllState.done) return;
    const top = seeAllMoreWrap.getBoundingClientRect().top;
    const vh = window.innerHeight || 0;
    // The grid opens on its first batch and stays on it: the next one is the
    // reader's to ask for by scrolling towards the bottom. A slot already on the
    // screen is the exception — there is nothing to scroll to reach it.
    if (!seeAllState.scrolled && top > vh) return;
    if (top > vh + 700) return;
    seeAllMerge();
  };

  // One look per frame however many scroll events arrive, and the scroll is the
  // signal itself: the slot's distance from the window decides, rather than a
  // report that was made before the reader moved. Back at the top — where an
  // open puts the window — is not a scroll, so a fresh grid cannot ask for
  // anything until it is scrolled.
  let seeAllFrame = 0;
  window.addEventListener('scroll', () => {
    if (!seeAllState.section || seeAllState.done) return;
    if (window.scrollY > 0) seeAllState.scrolled = true;
    if (seeAllFrame) return;
    seeAllFrame = requestAnimationFrame(() => {
      seeAllFrame = 0;
      seeAllCheck();
      // The grid hands back the pictures it scrolls away from, so the pass that
      // takes them again has to run with the scroll that brings them back.
      scheduleArt();
    });
  }, { passive: true });


  // Every row's See all opens that row's list. The button is found from the row
  // it sits in rather than given a handler of its own: the rows are rebuilt
  // when live data arrives, and one delegated listener survives that.
  document.addEventListener('click', (event) => {
    const see = event.target.closest?.('.row__head .btn--outline');
    if (see && !see.id) {
      const row = see.closest('.row');
      if (row && !row.classList.contains('seeall')) {
        openSeeAll(row.dataset.section, row.querySelector('.row__title')?.textContent.trim());
        return;
      }
    }
    // Leaving the grid for another destination closes it.
    if (event.target.closest?.('.nav-link, .brand')) closeSeeAll();
  });

  document.getElementById('see-all-back').addEventListener('click', closeSeeAll);

  // First paint: mark Home and render its first billboard slide.
  setView(document.body.dataset.view || 'home');
