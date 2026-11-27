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
  // The width at which the stylesheet switches the billboard from the 16:9
  // still to the title's vertical poster. The script names the file to decode
  // from the same breakpoint, so a phone never waits on the wide crop.
  const HERO_VERTICAL = window.matchMedia('(max-width: 700px)');
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
  let shownPortrait = '';
  const showBackdrop = (image, portrait) => {
    // The same slide painted again (the dot already selected, a view switch to
    // a title both tabs share) is not a new picture: fading it would flash.
    if (image === shownArt && portrait === shownPortrait) return;
    shownArt = image;
    shownPortrait = portrait;
    const still = reduceMotion.matches;
    if (!still) {
      heroMedia.style.transition = 'none';
      heroMedia.style.opacity = '0';
    }
    heroStage.style.setProperty('--art', `url("${image}")`);
    // Both crops sit on the stage, and the stylesheet picks one at its
    // breakpoint — the script does not have to know which is on screen.
    if (portrait) heroStage.style.setProperty('--art-portrait', `url("${portrait}")`);
    else heroStage.style.removeProperty('--art-portrait');
    if (still) return;
    const fadeUp = () => {
      heroMedia.style.transition = 'opacity 420ms ease-out';
      heroMedia.style.opacity = '1';
    };
    const art = new Image();
    // Decode the one this width paints. The other is only a custom property
    // until the window crosses the breakpoint, and costs nothing until then.
    art.src = HERO_VERTICAL.matches && portrait ? portrait : image;
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

    showBackdrop(coldURL(slide.image), coldURL(slide.portrait));
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
    [HERO_VERTICAL.matches ? (slide.portrait || slide.image) : slide.image, slide.logo]
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
        if (card.isConnected && (card.matches(':hover') || card === tapPending)) {
          tapPending = null;
          showPreview(card);
        }
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
      // A rele
