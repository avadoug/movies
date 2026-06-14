# Movie Radar: Tardis808 Edition

A polished, static, movies-only discovery website built for Doug/Tardis808's taste: sci-fi brain-benders, comic-book universes, time travel, true-crime/crime rise-and-fall stories, dark comedy, stoner cult picks, horror funk, animation/anime, and game-adjacent adventure.

## What is included

- `index.html` — the website shell
- `styles.css` — the cinematic neon interface
- `app.js` — search, filters, watchlist, live TMDb fetching, streaming provider display
- `movies.js` — 316 curated movie recommendations, no TV shows

## How to run

Open `index.html` in any modern browser. No server is required.

## How live streaming availability works

Streaming availability changes constantly, so this site fetches provider data live from TMDb instead of freezing old data into the HTML.

1. Create or use a TMDb account.
2. Get a TMDb v3 API key.
3. Open the site.
4. Paste the key into the **Live data key** box.
5. Click **Load posters & current streaming**.

Your key is saved only in your browser's `localStorage`.

## Features

- Movies only, no TV shows.
- 316 curated films.
- Real posters when TMDb data is loaded.
- Generated poster cards as fallback.
- Current watch providers by region, default `US`.
- Search by title, tag, cluster, vibe, and description.
- Filter by mood tags.
- Save your streaming services.
- Toggle **Only show movies on my services**.
- Toggle **Free/ad-supported only**.
- Save movies to a browser watchlist.
- Export watchlist as a text file.
- Details modal with overview, runtime, genres, and provider links.
- JustWatch search links for final availability checks.

## Notes and limitations

- TMDb provider data is very useful, but availability can still vary by plan, region, date, and bundled subscriptions.
- Always use the provider link or JustWatch search link as the final check before spending money.
- This product uses the TMDb API but is not endorsed or certified by TMDb.
- This site is not affiliated with JustWatch.

## Hosting

You can upload the folder to GitHub Pages, Netlify, Cloudflare Pages, or any static host.
