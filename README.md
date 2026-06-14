# Movie Radar: Tardis808 Edition

A polished, static, movies-only discovery website built for Doug/Tardis808's taste: sci-fi brain-benders, comic-book universes, time travel, true-crime/crime rise-and-fall stories, dark comedy, stoner cult picks, horror funk, animation/anime, and game-adjacent adventure.

## Important fix in this version

The first version only showed provider names after the TMDb live-data step, but that was too easy to miss. This patched version makes **Where to watch** visible on every movie card and adds a per-card **Load this movie** button.

The site supports both:

- TMDb **v3 API key**
- TMDb **v4 API Read Access Token**

If a movie says **Not loaded yet**, the site still needs your TMDb key/token and a live data load. Once loaded, cards show provider badges such as Netflix, Hulu, Max, Prime Video, Tubi, Peacock, rent/buy, etc. when TMDb has current provider data for your selected region.

## What is included

- `index.html` — the website shell
- `styles.css` — the cinematic neon interface
- `app.js` — search, filters, watchlist, live TMDb fetching, streaming provider display
- `movies.js` — 316 curated movie recommendations, no TV shows
- `manifest.json` — basic app metadata

## How to run

Open `index.html` in any modern browser. No server is required.

## How to make the streaming providers appear

Streaming availability changes constantly, so this site fetches provider data live from TMDb instead of freezing old data into the HTML.

1. Create or use a TMDb account.
2. Go to your TMDb API settings.
3. Copy either the short v3 API key or the long v4 Read Access Token.
4. Open `index.html`.
5. Paste the key/token into the **Live data key** box.
6. Click **Save + load**.
7. The provider badges appear under **Where to watch** on each movie card.
8. Use **refresh data** when you want to clear the cached provider listings and pull fresh ones.

Your key/token and loaded provider cache are saved only in your browser's `localStorage`.

## Features

- Movies only, no TV shows.
- 316 curated films.
- Real posters when TMDb data is loaded.
- Generated poster cards as fallback.
- Current watch providers by region, default `US`.
- Supports TMDb v3 API keys and v4 Read Access Tokens.
- Visible **Where to watch** section on every movie card.
- Per-card **Load this movie** button.
- Search by title, tag, cluster, vibe, and description.
- Filter by mood tags.
- Save your streaming services.
- Toggle **Only show movies on my services**.
- Toggle **Free/ad-supported only**.
- Save movies to a browser watchlist.
- Export watchlist with provider names when loaded.
- Details modal with overview and provider links.
- JustWatch search links for final availability checks.

## Notes and limitations

- TMDb provider data is useful, but availability can still vary by plan, region, date, and bundled subscriptions.
- Always use the provider link or JustWatch search link as the final check before spending money.
- This product uses the TMDb API but is not endorsed or certified by TMDb.
- This site is not affiliated with JustWatch.

## Hosting

You can upload the folder to GitHub Pages, Netlify, Cloudflare Pages, or any static host.
