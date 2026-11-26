// The catalogue, in the page.
//
// This file is the whole of what used to be serve.py's TMDB side: the rows,
// their order and the rule that keeps them disjoint, the billboard, the art
// and facts a card and its hover panel need, the See all walk, the search and
// the filter bar. It runs in the browser on purpose — the site is a static one
// (GitHub Pages included), so there is no server to hide a key or a cache in,
// and TMDB is asked by whoever is reading the page.
//
// The key lives in tmdb-config.js, which is public the moment it is deployed.
// That is the trade this build makes; the README says so in as many words.

(() => {
  const CONFIG = window.TMDB_CONFIG || {};
  const KEY = String(CONFIG.key || '').trim();
  const TOKEN = String(CONFIG.token || '').trim();
  const BASE = 'https://api.themoviedb.org/3';
  const ART = 'https://image.tmdb.org/t/p';

  // ── The rules ────────────────────────────────────────────────────────────
  // Same numbers as the server build, so a row reads the same either way.
  const HERO_COUNT = 6;
  const ROW_COUNT = 50;
  const MIN_RATING = 6.0;
  // Japanese and Chinese animation is its own shelf: the audience the Anime
  // view is for, and the one genre that arrives in bulk mixed into the rest.
  const ANIME_LANGUAGES = new Set(['ja', 'zh', 'yue']);
  const THEATRICAL_DAYS = 60;

  // One row per shelf, in the order the page shows them. Anime rows interleave
  // their queries so the Japanese sort cannot crowd Chinese animation out.
  const LISTS = {
    'trending': [['/trending/all/week', {}, 'movie']],
    'popular-movies': [['/movie/popular', {}, 'movie']],
    'popular-tv': [['/tv/popular', {}, 'tv']],
    'top-movies': [['/movie/top_rated', {}, 'movie']],
    'top-tv': [['/tv/top_rated', {}, 'tv']],
    // Upcoming's shelf is assembled from the rows' cast-offs and this same
    // coming-soon feed; See all walks the feed so the grid can keep going past
    // the fifty the shelf holds.
    'upcoming': [['/movie/upcoming', {}, 'movie']],
    'popular-anime': [
      ['/discover/tv', { with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc' }, 'tv'],
      ['/discover/tv', { with_genres: '16', with_origin_country: 'CN|HK|TW', sort_by: 'popularity.desc' }, 'tv'],
      ['/discover/movie', { with_genres: '16', with_origin_country: 'JP|CN|HK|TW', sort_by: 'popularity.desc' }, 'movie'],
    ],
    'top-anime': [
      ['/discover/tv', { with_genres: '16', with_origin_country: 'JP', sort_by: 'vote_average.desc', 'vote_count.gte': '300' }, 'tv'],
      ['/discover/tv', { with_genres: '16', with_origin_country: 'CN|HK|TW', sort_by: 'vote_average.desc', 'vote_count.gte': '50' }, 'tv'],
      ['/discover/movie', { with_genres: '16', with_origin_country: 'JP|CN|HK|TW', sort_by: 'vote_average.desc', 'vote_count.gte': '300' }, 'movie'],
    ],
  };
  const ROW_ORDER = ['trending', 'popular-movies', 'popular-tv', 'top-movies', 'top-tv', 'popular-anime', 'top-anime'];
  const UPCOMING = 'upcoming';

  // Continue Watching is a fixed shelf: ten well-known films with demo resume
  // positions, resolved through search so the row uses the same artwork as the
  // rest.
  const CONTINUE_WATCHING = [
    ['Interstellar', 0.62],
    ['The Dark Knight', 0.24],
    ['Dune: Part Two', 0.88],
    ['Oppenheimer', 0.45],
    ['Parasite', 0.12],
    ['Inception', 0.35],
    ['Whiplash', 0.71],
    ['Arrival', 0.18],
    ['Mad Max: Fury Road', 0.53],
    ['The Grand Budapest Hotel', 0.66],
  ];

  // ── Transport ────────────────────────────────────────────────────────────
  // One cache for the life of the page: a title looked up for a card is not
  // asked for again when its billboard or its grid opens, and a row page read
  // for the shelf is the page See all starts from.
  const cache = new Map();
  const waiting = new Map();
  let inFlight = 0;
  const queue = [];
  // TMDB runs two different limits, and they are not the same one:
  //   api.themoviedb.org — about 40 requests a second per IP, and 20
  //     connections per IP. Both are per address, not per key: a key buys no
  //     extra budget.
  //   image.tmdb.org — no request rate at all, only 20 simultaneous
  //     connections. That cap lives in the page's art pump, not here.
  // So the API side holds both of its numbers: twenty connections open, and no
  // more than forty starts in any second. The second one is a token bucket
  // rather than a pause between starts, so a quick burst is still quick — it
  // just cannot run past the ceiling and get 429s for it.
  const LIMIT = 20;         // connections in flight
  // The token in the config is sent as an Authorization header, and a header is
  // not a simple request: every call is paired with a CORS preflight, and the
  // CDN counts both. With the token, forty places in the second's budget is
  // eighty requests at the CDN — over the line, which is what the occasional
  // 429 was. So the budget is halved when the token is what authenticates,
  // and a key in the query string (a simple request, no preflight) gets the
  // full forty.
  const PREFLIGHT = Boolean(TOKEN) && !KEY;
  const PER_SECOND = PREFLIGHT ? 20 : 40;   // request starts in any one second

  // The starts of the last second, oldest first. A token bucket let the map be
  // read two ways: forty places a second on average, but a bucketful at the top
  // of one clock second plus the refill inside it is sixty starts at TMDB's
  // counter — measured at 56 — which is past the ceiling however the average
  // reads. The window below holds for every one-second stretch instead.
  const starts = [];
  let throttleTimer = 0;

  // Take a place in the last second's budget, or say how long until one frees.
  const takeToken = () => {
    const now = performance.now();
    while (starts.length && now - starts[0] >= 1000) starts.shift();
    if (starts.length >= PER_SECOND) return Math.max(1, Math.ceil(1000 - (now - starts[0])));
    starts.push(now);
    return 0;
  };

  const pump = () => {
    while (inFlight < LIMIT && queue.length) {
      const wait = takeToken();
      if (wait) {
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = 0;
            pump();
          }, Math.max(10, wait));
        }
        return;
      }
      const job = queue.shift();
      inFlight += 1;
      job().finally(() => {
        inFlight -= 1;
        pump();
      });
    }
  };

  const request = (url, headers) => new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const response = await fetch(url, { headers, cache: 'no-store' });
          // TMDB counts by the second: a 429 needs a pause, not a new plan.
          // When it names the pause, that is the one to take.
          if (response.status === 429 && attempt < 2) {
            const asked = Number(response.headers.get('retry-after') || 0) * 1000;
            await new Promise((go) => setTimeout(go, asked || 700 + attempt * 900));
            continue;
          }
          if (!response.ok) throw new Error(`TMDB ${response.status}`);
          resolve(await response.json());
          return;
        }
        throw new Error('TMDB kept refusing');
      } catch (error) {
        reject(error);
      }
    });
    pump();
  });

  const get = (path, params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(name, String(value));
    });
    if (KEY) query.set('api_key', KEY);
    const url = `${BASE}${path}?${query.toString()}`;
    if (cache.has(url)) return Promise.resolve(cache.get(url));
    if (waiting.has(url)) return waiting.get(url);
    // A key in the query is a simple request; the token rides a header and
    // costs a preflight on every URL. If both are set, the key is the cheaper
    // way to ask.
    const headers = TOKEN && !KEY ? { Authorization: `Bearer ${TOKEN}` } : {};
    const job = request(url, headers)
      .then((body) => {
        cache.set(url, body);
        waiting.delete(url);
        return body;
      })
      .catch((error) => {
        waiting.delete(url);
        throw error;
      });
    waiting.set(url, job);
    return job;
  };

  // ── One TMDB result, as the page renders it ─────────────────────────────
  const image = (path, size) => (path ? `${ART}/${size}${path}` : '');

  const normalise = (raw, defaultMedia) => {
    const media = raw.media_type === 'movie' || raw.media_type === 'tv'
      ? raw.media_type
      : defaultMedia;
    const title = String(raw.title || raw.name || '').trim();
    const backdrop = raw.backdrop_path;
    const poster = raw.poster_path;
    if (!title || (!backdrop && !poster)) return null;
    const date = raw.release_date || raw.first_air_date || '';
    const genres = raw.genre_ids
      || (raw.genres || []).map((genre) => genre.id);
    const ids = genres.filter((id) => typeof id === 'number');
    return {
      id: raw.id,
      media,
      anime: ids.includes(16) && ANIME_LANGUAGES.has(raw.original_language),
      title,
      year: String(date).slice(0, 4),
      date,
      rating: Math.round((raw.vote_average || 0) * 10) / 10,
      votes: raw.vote_count || 0,
      genre_ids: ids,
      overview: String(raw.overview || '').trim(),
      // Cards paint at 275-480px, so a w780 backdrop is plenty; billboards get
      // w1280 through the details pass.
      still: image(backdrop || poster, 'w780'),
      backdrop: image(backdrop, 'w1280'),
      logo: '',
      // True when the picture carries the title itself: a poster always does.
      titled: Boolean(poster && !backdrop),
      progress: 0,
    };
  };

  const lowRated = (item) => item.votes > 0 && item.rating < MIN_RATING;

  const day = (text) => {
    const stamp = Date.parse(`${String(text || '').slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(stamp) ? null : stamp;
  };
  const today = () => Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  const comingSoon = (item) => {
    const stamp = day(item.date);
    return stamp !== null && stamp > today();
  };
  const inTheaters = (item) => {
    if (item.media !== 'movie') return false;
    const opened = day(item.date);
    if (opened === null) return false;
    const now = today();
    return now - THEATRICAL_DAYS * 864e5 <= opened && opened <= now;
  };
  const goesToUpcoming = (item) => comingSoon(item) || inTheaters(item);

  const trailerKey = (payload) => {
    const videos = (payload.videos || {}).results || [];
    const youtube = videos.filter((video) => video.site === 'YouTube' && video.key);
    if (!youtube.length) return '';
    const rank = (video) => [
      { Trailer: 0, Teaser: 1, Clip: 2, Featurette: 3 }[video.type] ?? 4,
      video.official !== true,
      video.iso_639_1 !== 'en',
    ];
    youtube.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
    return youtube[0].key || '';
  };

  const releaseState = (media, payload) => {
    const status = String(payload.status || '').toLowerCase();
    if (['rumored', 'planned', 'in production', 'post production', 'pilot'].includes(status)) {
      return 'unreleased';
    }
    if (media !== 'movie') {
      const first = day(payload.first_air_date);
      return first !== null && first > today() ? 'unreleased' : 'released';
    }
    const events = [];
    ((payload.release_dates || {}).results || []).forEach((row) => {
      (row.release_dates || []).forEach((entry) => {
        const stamp = day(entry.release_date);
        if (stamp !== null) events.push([entry.type, stamp]);
      });
    });
    let theatrical = events.filter(([kind]) => kind === 2 || kind === 3).map(([, stamp]) => stamp).sort((a, b) => a - b);
    const digital = events.filter(([kind]) => kind === 4 || kind === 5).map(([, stamp]) => stamp).sort((a, b) => a - b);
    if (!theatrical.length) {
      const first = day(payload.release_date);
      if (first !== null) theatrical = [first];
    }
    if (!theatrical.length) return status === 'released' ? 'released' : 'unreleased';
    const opened = theatrical[0];
    if (opened > today()) return 'unreleased';
    if (digital.length && today() >= digital[0]) return 'released';
    return today() <= opened + THEATRICAL_DAYS * 864e5 ? 'theaters' : 'released';
  };

  const factsFor = (media, payload) => {
    const ratings = media === 'movie'
      ? [].concat(...((payload.release_dates || {}).results || []).map((row) => (row.release_dates || []).map((entry) => [row.iso_3166_1, String(entry.certification || '').trim()])))
      : ((payload.content_ratings || {}).results || []).map((row) => [row.iso_3166_1, String(row.rating || '').trim()]);
    const labels = ratings.filter(([, label]) => label);
    const cert = (labels.find(([country]) => country === 'US') || labels[0] || [])[1] || '';
    const facts = {
      genres: (payload.genres || []).map((genre) => genre.name).slice(0, 3),
      cert,
      release: releaseState(media, payload),
      trailer: trailerKey(payload),
    };
    if (media === 'movie') {
      facts.runtime = Math.round(payload.runtime || 0);
    } else {
      facts.seasons = Math.round(payload.number_of_seasons || 0);
      let episode = ((payload.episode_run_time || []).find((minute) => minute) || 0);
      if (!episode) {
        for (const key of ['last_episode_to_air', 'next_episode_to_air']) {
          episode = (payload[key] || {}).runtime || 0;
          if (episode) break;
        }
      }
      facts.episodes = Math.round(episode);
    }
    const kept = {};
    Object.entries(facts).forEach(([key, value]) => {
      if (value && (!Array.isArray(value) || value.length)) kept[key] = value;
    });
    return kept;
  };

  // The details call: the titled backdrop a card wants, the textless one and
  // the logo a billboard wants, and the numbers the hover panel prints. TMDB
  // has no batch form, so one title is one call.
  const titleData = async (media, id) => {
    const append = media === 'movie' ? 'images,release_dates,videos' : 'images,content_ratings,videos';
    let payload;
    try {
      payload = await get(`/${media}/${id}`, { append_to_response: append, include_image_language: 'en' });
    } catch (error) {
      return {};
    }
    const images = payload.images || {};
    const bestBackdrop = (language) => {
      let best = null;
      (images.backdrops || []).forEach((entry) => {
        if (entry.iso_639_1 !== language || (entry.width || 0) < 1280) return;
        const score = [(entry.vote_average || 0), (entry.vote_count || 0)];
        if (!best || score[0] > best[0][0] || (score[0] === best[0][0] && score[1] > best[0][1])) {
          best = [score, entry.file_path];
        }
      });
      return best ? best[1] : null;
    };
    const logos = (images.logos || []).filter((logo) => logo.iso_639_1 === 'en' || logo.iso_639_1 === null);
    let logo = null;
    logos.forEach((entry) => {
      if (!logo || (entry.vote_average || 0) > (logo.vote_average || 0)
        || ((entry.vote_average || 0) === (logo.vote_average || 0) && (entry.width || 0) > (logo.width || 0))) {
        logo = entry;
      }
    });
    return {
      card: bestBackdrop('en'),
      hero: bestBackdrop(null),
      logo: logo ? logo.file_path : null,
      facts: factsFor(media, payload),
    };
  };

  // ── Rows ─────────────────────────────────────────────────────────────────
  const fetchList = async (name, page) => {
    const animeRow = name.endsWith('-anime');
    const groups = await Promise.all((LISTS[name] || []).map(async ([path, params, media]) => {
      const payload = await get(path, { ...params, page });
      return (payload.results || [])
        .map((raw) => normalise(raw, media))
        .filter((item) => item && item.anime === animeRow && !lowRated(item));
    }));
    // Round-robin across the queries, so the two sorts share the row evenly.
    const items = [];
    const longest = Math.max(0, ...groups.map((group) => group.length));
    for (let index = 0; index < longest; index += 1) {
      groups.forEach((group) => {
        if (group[index]) items.push(group[index]);
      });
    }
    return items;
  };

  const keyOf = (item) => `${item.media}:${item.id}`;

  const continueWatching = async () => {
    const found = await Promise.all(CONTINUE_WATCHING.map(async ([title, progress]) => {
      try {
        const payload = await get('/search/movie', { query: title, include_adult: 'false' });
        const match = (payload.results || [])
          .map((raw) => normalise(raw, 'movie'))
          .find((item) => item && item.title.toLowerCase() === title.toLowerCase());
        if (match) match.progress = progress;
        return match || null;
      } catch (error) {
        return null;
      }
    }));
    return found.filter(Boolean);
  };

  // The catalogue, in the order the page can use it: the billboard and Continue
  // Watching, then the leading `gate` titles of the gate shelves — what the
  // loader waits on — and finally the rest of each shelf, grown after the page
  // is up in the batch order the reader walks them. The three `lateRows` shelves
  // are left empty for that second half. A shelf fetched whole before the first
  // paint is a loader that waits on titles nobody is looking at yet.
  const catalogue = async (stage, { gate = 10, lateRows = [] } = {}) => {
    const watching = await continueWatching();
    const [movies, shows, anime] = await Promise.all([
      fetchList('popular-movies', 1),
      fetchList('popular-tv', 1),
      fetchList('popular-anime', 1),
    ]);
    const claimed = new Set(watching.map(keyOf));
    watching.forEach((item) => {
      item.deferred = true;
    });

    const interleave = (left, right) => {
      const mixed = [];
      const longest = Math.max(left.length, right.length);
      for (let index = 0; index < longest; index += 1) {
        if (left[index]) mixed.push(left[index]);
        if (right[index]) mixed.push(right[index]);
      }
      return mixed;
    };

    // Billboards: the six titles whose listing carries a backdrop and copy,
    // dressed with the textless art and the logo only a details call has.
    const heroFrom = async (items, media) => {
      const good = items.filter((item) => item.backdrop && item.overview);
      const rest = items.filter((item) => !good.includes(item));
      const chosen = (good.concat(rest)).slice(0, HERO_COUNT);
      await Promise.all(chosen.map(async (item) => {
        const data = await titleData(item.media || media, item.id);
        if (data.hero) item.backdrop = image(data.hero, 'w1280');
        if (data.logo) item.logo = image(data.logo, 'w500');
        if (data.facts) item.facts = data.facts;
      }));
      return chosen.map((item) => ({
        id: item.id,
        media: item.media || media,
        title: item.title,
        overview: item.overview,
        backdrop: item.backdrop,
        still: item.still,
        logo: item.logo,
        facts: item.facts || {},
        trailer: (item.facts || {}).trailer || '',
        rating: item.rating,
      }));
    };

    const home = interleave(movies, shows);
    const animeList = anime.slice(0, HERO_COUNT);
    // Only the home billboard is read before the first line goes out. The other
    // three destinations' billboards are not on the reader's first screen, so
    // they are looked up alongside the shelves below instead of in front of it.
    const hero = { home: await heroFrom(home, 'movie') };
    // Those three run beside the row walk — same requests as before, but
    // overlapping the shelves instead of queueing behind them.
    const heroRest = Promise.all([
      heroFrom(movies, 'movie'),
      heroFrom(shows, 'tv'),
      heroFrom(animeList, 'tv'),
    ]).then(([moviesHero, tvHero, animeHero]) => {
      hero.movies = moviesHero;
      hero.tv = tvHero;
      hero.anime = animeHero;
      return hero;
    });
    d('hero ready');

    stage({
      sections: { 'continue-watching': watching },
      hero: { home: hero.home },
      partial: true,
    });

    // The rest: the leading `gate` titles of each gate row, skipped past what
    // the rows above already own, with anything not out yet handed to Upcoming.
    // The held-back rows stay empty here; the rest of each row is grown after
    // the first paint, twenty at a time, in the order the shelves are read.
    const sections = {};
    const claims = new Set(watching.map(keyOf));
    claimsByRow['continue-watching'] = new Set(claims);
    const pending = [];
    const theatres = [];
    const pages = {};
    // One feed a row: the page it stopped on, the titles of that page not taken
    // yet, and every title it has already been offered. A row grown ten at a
    // time has to pick up the rest of a half-read page instead of skipping it.
    const feeds = {};

    const grow = async (name, target) => {
      const items = (sections[name] || []).slice();
      const feed = feeds[name] || (feeds[name] = { page: 1, queue: [], seen: new Set() });
      const take = () => {
        while (feed.queue.length && items.length < target) {
          const item = feed.queue.shift();
          const key = keyOf(item);
          if (claims.has(key)) continue;
          if (comingSoon(item)) {
            pending.push(item);
            continue;
          }
          if (inTheaters(item)) {
            theatres.push(item);
            continue;
          }
          if (!item.facts) item.deferred = true;
          items.push(item);
          claims.add(key);
        }
      };
      // A page can add nothing and still not be the end: the rows divide the
      // catalogue between them. Five dry pages in a row is the list running out.
      let dry = 0;
      while (items.length < target && feed.page <= 25 && dry < 5) {
        take();
        if (items.length >= target) break;
        const page = feed.page;
        feed.page += 1;
        let list;
        try {
          list = pages[name]?.[page] || await fetchList(name, page);
        } catch (error) {
          break;
        }
        pages[name] = pages[name] || {};
        pages[name][page] = list;
        for (const item of list) {
          const key = keyOf(item);
          if (feed.seen.has(key)) continue;
          feed.seen.add(key);
          feed.queue.push(item);
        }
        const before = items.length;
        take();
        dry = items.length === before ? dry + 1 : 0;
        if (!list.length) break;
      }
      sections[name] = items;
      // What this shelf owns, which is what See all walks past in the shelves
      // around it.
      claimsByRow[name] = new Set(items.map(keyOf));
    };

    for (const name of ['trending', 'popular-movies', 'popular-tv', 'top-movies', 'top-tv', 'popular-anime', 'top-anime']) {
      // The visible shelves held back for after the reveal start empty: their
      // leading ten is fetched by the first growth round instead. Everything
      // else is seeded now, so the loader has four shelves' gates to wait on.
      const seeds = lateRows.includes(name) ? 0 : gate;
      await grow(name, seeds);
      // Handed over now, not with the whole catalogue at the end: the page
      // paints this shelf and starts its one-request-per-title lookups while the
      // next row is still being read. Holding them until the last fetch is what
      // turned every card's details into a second, serial pass after the
      // catalogue and pushed the first paint out to seven seconds.
      if (sections[name].length) stage({ sections: { [name]: sections[name] }, partial: true });
      d(`row ${name} ${sections[name].length}`);
    }

    // Upcoming: what the rows gave back for not being out yet, topped up from
    // TMDB's own coming-soon list. It is one of the held-back shelves, so it
    // starts empty and gets its leading ten after the reveal.
    const coming = [];
    const comingKeys = new Set();
    const takeComing = (items, limit = ROW_COUNT) => {
      items.forEach((item) => {
        if (coming.length >= limit) return;
        const key = keyOf(item);
        if (claims.has(key) || comingKeys.has(key) || !goesToUpcoming(item)) return;
        comingKeys.add(key);
        claims.add(key);
        // Upcoming comes from the coming-soon list and from the rows' own
        // cast-offs, not from the row walk — so it carries no deferred mark of
        // its own. Without one the cards are never asked for their details and
        // every cover stays the textless list art under a caption.
        item.deferred = true;
        coming.push(item);
      });
    };
    const upcomingSeeds = lateRows.includes(UPCOMING) ? 0 : gate;
    takeComing(pending, upcomingSeeds);
    takeComing(theatres, upcomingSeeds);
    let upcomingPage = 1;
    const topUpComing = async (target) => {
      while (coming.length < target && upcomingPage <= 10) {
        const page = upcomingPage;
        upcomingPage += 1;
        const payload = await get('/movie/upcoming', { page });
        const items = (payload.results || []).map((raw) => normalise(raw, 'movie')).filter(Boolean);
        takeComing(items, target);
        if (!items.length) break;
      }
    };
    await topUpComing(upcomingSeeds);
    sections[UPCOMING] = coming;

    // The rest of the billboards have been arriving while the rows were read.
    await heroRest.catch(() => hero);
    stage({ sections: { [UPCOMING]: coming }, hero, partial: false });

    // After the first paint. One row's next batch, then the next row's, round
    // again until every shelf is as long as it gets — the order the page dresses
    // them in. Each batch is returned, not staged: the page asks for its details
    // first and only then appends it, so a card from a batch is never painted
    // with the list page's still and swapped in the open.
    const growUpcoming = async (count) => {
      const before = coming.length;
      if (before >= ROW_COUNT) return [];
      const target = Math.min(ROW_COUNT, before + count);
      takeComing(pending, target);
      takeComing(theatres, target);
      await topUpComing(target);
      const chunk = coming.slice(before);
      sections[UPCOMING] = coming;
      return chunk;
    };

    return {
      async growRow(name, count) {
        if (name === UPCOMING) return growUpcoming(count);
        // An empty row is a held-back shelf on its first turn, not a failure:
        // the catalogue left it at zero for the ordered pass to seed.
        const before = (sections[name] || []).length;
        if (before >= ROW_COUNT) return [];
        await grow(name, Math.min(ROW_COUNT, before + count));
        return sections[name].slice(before);
      },
    };
  };

  // ── Details, for the cards the screen reaches ────────────────────────────
  const details = async (keys) => Promise.all(keys.map(async ({ media, id }) => {
    const data = await titleData(media, id);
    return {
      media,
      id,
      still: data.card ? image(data.card, 'w780') : '',
      titled: Boolean(data.card),
      facts: data.facts || {},
      hero: data.hero ? image(data.hero, 'w1280') : '',
      logo: data.logo ? image(data.logo, 'w500') : '',
    };
  }));

  // ── See all ──────────────────────────────────────────────────────────────
  // The rows are disjoint, so a grid walks its own list past what the shelves
  // above own. Pages are kept per section, so the next window extends the walk
  // instead of starting it again.
  const walks = new Map();
  const walk = (name) => {
    if (!walks.has(name)) walks.set(name, { items: [], pages: 0, done: false, claimed: claimedBy(name) });
    return walks.get(name);
  };
  // What every other shelf owns, so See all opens on its own row and then keeps
  // walking past the titles the shelves around it took.
  const claimsByRow = {};
  const claimedBy = (name) => {
    const blocked = new Set();
    Object.entries(claimsByRow).forEach(([row, keys]) => {
      if (row !== name) keys.forEach((key) => blocked.add(key));
    });
    return blocked;
  };

  // TMDB serves list pages up to page 500. The walk used to stop at forty,
  // which put "That's the whole list" under the first few hundred covers of a
  // list that had thousands left. The ceiling is TMDB's, not a reading budget.
  const WALK_PAGES = 500;

  const growSection = async (name, want) => {
    const state = walk(name);
    while (state.items.length < want && state.pages < WALK_PAGES && !state.done) {
      const page = state.pages + 1;
      let list;
      try {
        list = await fetchList(name, page);
      } catch (error) {
        // A page that failed is not the end of the list: TMDB refusing one
        // request (a rate limit, a dropped connection) used to mark the walk
        // finished for good, which is what stopped a grid at a few hundred
        // titles. The page is asked for again by the next batch instead.
        break;
      }
      state.pages = page;
      if (!list.length) state.done = true;
      list.forEach((item) => {
        const key = keyOf(item);
        if (state.claimed.has(key)) return;
        if (name !== UPCOMING && goesToUpcoming(item)) return;
        if (state.items.some((held) => keyOf(held) === key)) return;
        state.items.push(item);
        state.done = state.done || false;
      });
    }
    // The walk has a ceiling of its own: once it is reached there is nothing
    // further to ask for, and the grid has to hear that rather than keep asking.
    if (state.pages >= WALK_PAGES) state.done = true;
    return state.items;
  };

  const section = async (name, offset, limit) => {
    const items = await growSection(name, offset + limit);
    // "No more after this" is the list being finished, not this window coming
    // back short: a page that failed returns fewer titles than asked for, and
    // reading that as the end of the row is what closed a grid at a few hundred
    // covers. The next ask picks the failed page up again.
    const more = items.length > offset + limit || !walk(name).done;
    return { items: items.slice(offset, offset + limit), hasMore: more };
  };

  // ── Search ───────────────────────────────────────────────────────────────
  const search = async (text, offset, limit) => {
    const pool = [];
    const seen = new Set();
    const cleaned = String(text || '').trim();
    for (let page = 1; page <= 5; page += 1) {
      let payload;
      try {
        payload = cleaned
          ? await get('/search/multi', { query: cleaned, page, include_adult: 'false' })
          : await get('/trending/all/week', { page });
      } catch (error) {
        break;
      }
      ((payload.results || [])).forEach((raw) => {
        const media = raw.media_type === 'tv' ? 'tv' : 'movie';
        const item = normalise(raw, media);
        if (!item || item.anime) return;
        const key = keyOf(item);
        if (seen.has(key)) return;
        seen.add(key);
        pool.push(item);
      });
      if (page >= (payload.total_pages || 1)) break;
    }
    return {
      items: pool.slice(offset, offset + limit),
      hasMore: pool.length > offset + limit,
    };
  };

  // ── The filter bar ───────────────────────────────────────────────────────
  const GENRE_ALIASES = {
    'Action & Adventure': ['Action', 'Adventure'],
    'Sci-Fi & Fantasy': ['Science Fiction'],
    'War & Politics': ['War'],
  };
  let genresPromise = null;
  const genres = () => {
    if (!genresPromise) {
      genresPromise = Promise.all([
        get('/genre/movie/list'),
        get('/genre/tv/list'),
      ]).then(([movies, shows]) => {
        const byName = new Map();
        (movies.genres || []).forEach((genre) => {
          if (!byName.has(genre.name)) byName.set(genre.name, []);
          byName.get(genre.name).push(genre.id);
        });
        (shows.genres || []).forEach((genre) => {
          const names = GENRE_ALIASES[genre.name] || [genre.name];
          names.forEach((name) => {
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name).push(genre.id);
          });
        });
        return {
          movie: movies.genres || [],
          tv: shows.genres || [],
          both: [...byName.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, ids]) => ({ id: [...new Set(ids)].sort((a, b) => a - b).join('-'), name })),
        };
      });
    }
    return genresPromise;
  };

  const FILTER_MEDIA = {
    'trending': 'movie',
    'popular-movies': 'movie',
    'popular-tv': 'tv',
    'top-movies': 'movie',
    'top-tv': 'tv',
    'top-anime': 'tv',
    'popular-anime': 'tv',
    'upcoming': 'movie',
  };
  const MIXED = new Set(['trending', 'top-anime', 'popular-anime', 'search']);

  const filters = async (name) => {
    const list = await genres();
    return {
      configured: true,
      section: name,
      mixed: MIXED.has(name),
      media: FILTER_MEDIA[name] || 'movie',
      genres: list,
      years: Array.from({ length: new Date().getFullYear() - 1899 }, (_, index) => String(new Date().getFullYear() - index)),
      score: { min: 0, max: 10, step: 0.1, votes: 10 },
    };
  };

  // The bar's cuts, applied the way the server applied them: every title
  // answers for itself, so the pool is walked and filtered as it goes.
  const keeps = (item, params) => {
    const groups = params.genres;
    if (groups.length) {
      const has = (ids) => item.genre_ids.some((id) => ids.includes(id));
      if (!groups.every((ids) => has(ids))) return false;
    }
    if (params.exclude.length && params.exclude.some((ids) => item.genre_ids.some((id) => ids.includes(id)))) {
      return false;
    }
    if (params.years.length && !params.years.includes(String(item.year))) return false;
    if (params.score) {
      const floor = Number(params.score);
      if (item.votes < 10 || item.rating < floor) return false;
    }
    if (params.types.length && !params.types.includes(item.media)) return false;
    const released = params.release.length ? params.release : ['released', 'theaters', 'unreleased'];
    const state = item.date && (comingSoon(item) ? 'unreleased' : item.media === 'movie' && inTheaters(item) ? 'theaters' : 'released');
    if (state && !released.includes(state)) return false;
    return true;
  };

  const order = (sort, items) => {
    const sorted = [...items];
    if (sort === 'oldest') sorted.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    else if (sort === 'newest') sorted.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    else if (sort === 'az') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'za') sorted.sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === 'rated') sorted.sort((a, b) => b.rating - a.rating || b.votes - a.votes);
    return sorted;
  };

  const filterSection = async (name, offset, limit, params) => {
    if (name === 'search') {
      const text = String(params.query || '').trim();
      const all = [];
      const seen = new Set();
      for (let page = 1; page <= 5; page += 1) {
        const payload = text
          ? await get('/search/multi', { query: text, page, include_adult: 'false' })
          : await get('/trending/all/week', { page });
        ((payload.results || [])).forEach((raw) => {
          const media = raw.media_type === 'tv' ? 'tv' : 'movie';
          const item = normalise(raw, media);
          if (!item || item.anime) return;
          const key = keyOf(item);
          if (seen.has(key)) return;
          seen.add(key);
          all.push(item);
        });
        if (page >= (payload.total_pages || 1)) break;
      }
      const kept = order(params.sort, all.filter((item) => keeps(item, params)));
      return { items: kept.slice(offset, offset + limit), hasMore: kept.length > offset + limit };
    }
    const pool = (await growSection(name, offset + limit + 40)).filter((item) => keeps(item, { ...params, types: [], release: params.release }));
    const kept = order(params.sort, pool);
    return { items: kept.slice(offset, offset + limit), hasMore: kept.length > offset + limit };
  };

  const readParams = (searchParams) => ({
    genres: String(searchParams.get('genres') || '').split(',').filter(Boolean)
      .map((group) => group.split('-').map(Number)),
    exclude: String(searchParams.get('exclude') || '').split(',').filter(Boolean)
      .map((group) => group.split('-').map(Number)),
    years: String(searchParams.get('years') || '').split(',').filter(Boolean),
    score: searchParams.get('score'),
    sort: searchParams.get('sort') || '',
    types: String(searchParams.get('type') || '').split(',').filter(Boolean),
    release: String(searchParams.get('release') || '').split(',').filter(Boolean),
    query: searchParams.get('q') || '',
  });

  // Debug line, kept quiet unless asked for: `localStorage.tmdbDebug = '1'`.
  const d = (message) => {
    try {
      if (localStorage.getItem('tmdbDebug') === '1') console.info('[tmdb]', message);
    } catch (error) { /* storage can be denied; the line is only a courtesy */ }
  };

  window.TMDB = {
    configured: Boolean(KEY || TOKEN),
    catalogue,
    details,
    section,
    search,
    filters,
    filter: filterSection,
    readParams,
    normalise,
    day,
    comingSoon,
    inTheaters,
  };
})();
