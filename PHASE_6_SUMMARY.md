# Phase 6: The QR menu

## Built

- **`apps/menu`**: the published menu site. `entry-server.tsx` renders the same
  `packages/renderer` output to HTML on the server, adds JSON-LD, `hreflang` links for every
  translated language, and the venue's palette; `entry-client.ts` is two small vanilla islands —
  search and section tabs. No framework reaches the diner.
- **The publish job**: writes HTML, subsetted fonts per pairing, the client assets and the images to
  the publish target (the local filesystem, or S3 in production). HTML is written with
  `s-maxage=5`, hashed assets with a one-year immutable cache, so a republish is live in seconds
  **without** a CloudFront invalidation; the invalidation that is issued is a best-effort speed-up.
- **QR codes**: generated for a published menu, downloadable as PNG and SVG for table tents.
- **Availability windows**: brunch and happy-hour sections show or hide against the venue's time
  zone, computed at request time in the island rather than baked into the HTML.
- **Analytics**: `menu_views` rows are aggregated nightly by a scheduled pg-boss job.
- **The publish screen**: theme mode (match the print design or a lighter screen variant), the live
  URL, the QR code, and what changed since the last publish.

## Problems solved along the way

- The first published menu was unstyled: with `cssCodeSplit` off, Vite lists the stylesheet as its
  own manifest entry rather than under the chunk, so the job was looking in the wrong place.
- The chrome rendered a light bar over a dark menu. The palette is now passed into `MenuChrome` and
  the CSS derives its own colours with `color-mix` and `currentColor`.

## Known issues

- The Content-Security-Policy on the menu distribution has to allow `'unsafe-inline'` for scripts,
  because each page inlines its own JSON-LD and a JSON config blob and the header is per-distribution,
  so per-page hashes are not possible. The mitigation is at the source: owner text is always rendered
  as text (`dangerouslySetInnerHTML` is banned by lint) and injected JSON is escaped.
- The published menu has only been measured on a local server. Real CloudFront latency will add to
  the numbers below, though the page is small enough that it should stay well inside budget.

## Verified

`e2e/qr-menu.spec.ts` publishes a seeded menu, loads it on a phone-sized Chromium, and asserts the
items are in the server-rendered HTML, the search island filters and shows an empty state, the page
declares its language and JSON-LD, there are no console errors, and JS + CSS together stay under
60 KB uncompressed.

`e2e/qr-performance.spec.ts` throttles the browser to 4 Mbps with 70 ms latency and a 4x CPU
slowdown — a mid-range phone on a restaurant's 4G — and measures **LCP 1104 ms, FCP 1088 ms over 8
requests**, against a 2.5 s threshold. A second test aborts every script request and confirms the
menu still renders in full: the islands are an enhancement, and a diner whose JavaScript never
arrives still gets the menu.
