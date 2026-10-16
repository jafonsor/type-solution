# Grilling: hosting and deployment

Type: grilling
Status: resolved

## Question

Where does the public game run, and how does a new build get there? The app is an Obelisk wasm frontend plus a Snap backend that only serves it, built with `nix build`. Options include running that server on a host (VPS, Fly.io and similar) or serving the built files from static hosting; cover the domain, HTTPS, the CSP header the sandbox needs, and how a deploy is triggered.

## Answer

Static hosting on GitHub Pages; no server runs in production.

- **No server.** The Snap backend only serves the page and its files, so production ships those files instead. A build step runs the backend once, saves the first page it renders plus the asset folders, and that folder is the site. The wasm and JS output is the same on any machine.
- **Build and deploy.** GitHub Actions runs on every push to `main`: `nix build`, export, then force-push the result as a single commit to a `gh-pages` branch, so old builds don't pile up (any old build can be rebuilt from its `main` commit). The branch is both the stored build, which anyone can get with `git fetch`, and the live site.
- **Address.** `jafonsor.github.io/type-solution`, GitHub's free per-repo address. No custom domain for now; one can be added later without changing anything else.
- **CSP.** GitHub Pages can't set response headers, so the network block goes in a `<meta>` tag, and the test worker starts from a blob URL so that it takes on the page's rules. If [Research: do blob workers inherit a meta-tag CSP?](14-research-blob-worker-csp.md) finds a major browser (Safari is the doubt) where it doesn't hold, ship without the network block: the only code that runs is what the player typed, in their own browser.
- Rejected: a Linux server (VPS / Fly.io). It needs a Linux build and a box to keep up, for a backend with nothing to do. Cloudflare Pages in front of the branch would give real headers, but a second host isn't worth it for a nice-to-have block.
