# ADR-011: Tablet screenshot via html2canvas self-snapshot
Date: 2026-06-29
Status: Accepted

## Context

The palantir super-admin panel needed a way to see what is actually rendering on each workspace's physical tablets. The naive approach — showing the tablet URL in a scaled iframe inside palantir — was built first, but identified as insufficient: the iframe renders the page in *the admin's browser* (Chrome on a MacBook), not in Silk on a Fire tablet. It would not surface Silk-specific layout bugs, font failures, or error screens.

The requirement became: show the output of the tablet's own browser, not a re-rendering of the same page elsewhere.

### Options considered

**Scaled iframes** — embed `/{workspace}/room/{roomId}` directly in palantir at 25% scale. Simple, live data. Built and shipped first. Rejected as the primary solution because it shows what your browser renders, not what the tablet renders. A Silk rendering bug would be invisible.

**Puppeteer / headless Chromium on Vercel** — a server-side screenshot endpoint that boots Chromium, authenticates as the tablet, navigates to the tablet URL, and captures a PNG. Would produce a true browser screenshot. Rejected: the `@sparticuz/chromium` package needed for Vercel compatibility is ~50MB and pushes function bundles past Vercel's limits on the current plan. Cold starts would be 2–5s per screenshot. Also: a separate headless session doesn't capture the exact state of the running tablet anyway (it would show a fresh load, not the current screen).

**External screenshot service (URLbox, ScreenshotOne, etc.)** — third-party API that takes a URL and returns a screenshot. Rejected: the tablet route requires a `ws_{slug}` cookie for authentication, which can't be passed to an external service. Making the route publicly accessible for the screenshotting service would require a separate unauthenticated preview mode and would be a meaningful security regression.

**ADB wireless screenshot** — enable developer mode on each Fire tablet, use ADB over TCP to take OS-level screenshots on demand. Would produce a pixel-perfect screenshot of exactly what's on screen including the browser chrome and status bar. Rejected as the primary approach: requires per-tablet setup (developer mode, wireless ADB enabled), requires the admin to be on the same network or have remote ADB infrastructure, and is significantly more complex to operate. Viable as a future addition for power users.

**html2canvas self-snapshot** — the tablet page dynamically imports `html2canvas`, renders its own DOM to a canvas, encodes it as a JPEG, and POSTs it to the server. Palantir fetches and displays the stored images.

## Decision

html2canvas self-snapshot. The tablet's own browser does the rendering and uploads the result.

The snapshot runs 5 seconds after page load (giving data fetches and fonts time to complete) and then every 5 minutes. It is uploaded to `/api/[workspace]/tablet-snapshot` and stored in Redis with a 48-hour TTL. Palantir fetches snapshots via the same endpoint using the `palantir_session` cookie (see ADR-012 for why this passes middleware).

The key property: html2canvas executes inside Silk (or whatever browser the tablet uses). Silk's rendering quirks, failed font loads, and broken layouts are all captured. If the tablet is showing an error screen, the error screen is what gets uploaded.

## Consequences

**Better:** Any tablet using the standard spacebook room display page automatically participates — no native app, no developer mode, no per-tablet configuration. Works on Fire tablets, iPads, any Android browser.

**Fidelity gap:** html2canvas re-renders the DOM to a canvas rather than capturing the framebuffer. It does not reproduce every CSS feature faithfully (some filters, backdrop-blur, certain SVG effects). For a UI that is primarily flat colours, text, and borders, fidelity is ~95%. Canvas rendering, native video, and WebGL would be missed entirely (spacebook has none of these).

**Not real-time:** Palantir shows the last uploaded snapshot, which is up to 5 minutes old. This is a monitoring tool, not a screen-share. A "Refresh" button per workspace re-fetches whatever is currently in Redis; it cannot force a new snapshot from the tablet.

**Bundle cost:** html2canvas (~200KB gzipped) is dynamically imported after the page mounts — it does not affect the tablet page's initial load time. The import happens on the first capture attempt.

**Storage:** A 1280×800 JPEG at quality 0.72 is roughly 100–200KB as a base64 string in Redis. At 20 rooms the total is under 4MB. The 48-hour TTL means stale snapshots from decommissioned rooms expire automatically.

**Security:** The POST endpoint requires the `ws_{workspace}` cookie — only the authenticated tablet session can upload. The GET endpoint requires `ws_{workspace}`, `admin_{workspace}`, or `palantir_session` — screenshots are not publicly accessible. This matters because snapshots may contain booking titles or organiser names depending on workspace visibility settings.

**Future:** ADB-based screenshotting could be layered on for workspaces that want OS-level fidelity. The storage and display infrastructure is already in place; it would just need a different upload path.
