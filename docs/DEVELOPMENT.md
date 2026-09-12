# Development

[Project overview](../README.md) · [Usage, in French](UTILISATION.md) · [SEO maintenance](SEO-MULTILINGUE.md)

EvPortal serves a static dashboard and generated language pages. A separate Cloudflare Worker handles temporary encrypted QR transfers. Telegra.ph provides optional public backup pages.

## Set up the repository

**Node.js 24 is recommended; Node.js 22 or newer is required.** Install both dependency sets from the repository root:

```bash
npm ci
npm ci --prefix relay
```

The root tools include the HTML parser used by SEO generation and tests, Playwright and axe. The relay tools include Wrangler and the local Cloudflare runtime. The site serves its browser libraries from the repository, without a runtime CDN dependency.

## Start a local preview

```bash
npm run dev
```

Open **http://127.0.0.1:4187/**. The development server serves a local `/js/config.js` response pointing to the real relay on port 8787; it does not edit the production configuration file. It starts a local Worker when needed, or verifies an existing EvPortal relay, including its allowed origins and session creation, reception and deletion.

`Ctrl+C` stops the portal and only the Worker it started. An existing relay is left running. An occupied port belonging to another service causes startup to fail without terminating that service. Alternative ports are supported:

```bash
npm run dev -- --port 4188 --relay-port 8788
```

The server binds to loopback. To exercise QR transfer on one computer, use two separate browser profiles and open the decoded QR address in the second profile. On a physical phone, `localhost` and `127.0.0.1` refer to the phone itself. Cross-device testing needs portal and relay HTTPS addresses reachable by both devices, with the portal origin allowed by the relay. Replacing loopback with a LAN HTTP address does not supply the secure context required by Web Crypto.

A static-only preview is also possible:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. This serves the checked-in public configuration, including its relay address, unchanged; it does not create a local relay setup. A local preview may differ from the published site.

## Source files and generated output

| Path | Purpose |
| --- | --- |
| [`index.html`](../index.html), [`aide.html`](../aide.html) | Editable dashboard and guide templates |
| [`css/styles.css`](../css/styles.css) | Layout, themes and display preferences |
| [`js/catalog.js`](../js/catalog.js), [`js/icons.js`](../js/icons.js) | Shared catalogue and local service logos |
| [`js/state.js`](../js/state.js) | Portable state, validation, migrations and category membership |
| [`js/preferences.js`](../js/preferences.js) | Device display, home-screen and category-visibility preferences |
| [`js/script.js`](../js/script.js) | Dashboard interactions and backup library interface |
| [`js/backups.js`](../js/backups.js), [`js/telegraph.js`](../js/telegraph.js) | Local snapshots and explicit public backup operations |
| [`js/pairing.js`](../js/pairing.js), [`relay/`](../relay/README.md) | Encrypted phone transfers and temporary storage |
| [`js/config.js`](../js/config.js), [`js/tesla.js`](../js/tesla.js) | Public relay configuration and fullscreen behaviour |
| [`js/locales/`](../js/locales/), [`js/i18n.js`](../js/i18n.js), [`js/seo.js`](../js/seo.js) | Translation sources, language selection and deployment-relative assets |
| [`scripts/build-seo.mjs`](../scripts/build-seo.mjs), [`seo.config.json`](../seo.config.json) | HTML generation and public SEO configuration |
| [`img/`](../img/), [`fonts/`](../fonts/README.md), [`js/vendor/`](../js/vendor/) | Bundled assets and their provenance or licences |

Edit the root HTML templates and the locale JSON files, then regenerate:

```bash
npm run build:seo
npm run check:seo
```

`build:seo` builds the translation bundle, 18 HTML pages, sitemap and project `robots.txt`. Commit the source changes and generated output together. Do not edit the language directories or `js/translations.js` directly. The checker reports stale generated files without rewriting them.

## Tests

Install the browser used by the smoke tests:

```bash
npx playwright install chromium
```

On Linux hosts missing browser system libraries, use `npx playwright install --with-deps chromium` during environment setup.

Run the checks appropriate to the change:

```bash
npm test
npm run test:browser
npm run test:catalog
npm run test:interactions
npm run test:share
npm run test:pairing
npm run test:relay
npm run test:i18n
npm run test:seo
```

The unit suite requires installed dependencies, including the HTML parser. Browser checks cover imports, storage failures, category membership, accessible interactions, translated routes and layouts. Most browser scripts start their own temporary local server. Reports and screenshots are written to `test-results/` and are ignored by Git.

The general browser smoke test can use the running development server:

```bash
EVPORTAL_TEST_URL=http://127.0.0.1:4187/ npm run test:browser
```

For the full browser-to-Worker transfer, leave `npm run dev` running and use another terminal:

```bash
npm run test:pairing:live
```

This follows the actual QR address with the development server's configuration, checks encrypted transfer, local backup addition, explicit restoration, undo and storage failures. The mocked Telegra.ph smoke tests do not publish real pages. Browser automation does not replace testing Web Crypto, touch interaction, connectivity and fullscreen on the target vehicle.

## Catalogue and translations

Keep stable category IDs and `serviceId` values. Store a service once and describe its shared categories through `categoryIds`. The catalogue is common to all users; regional service metadata does not filter it. Default and optional entries are controlled by `defaultIncluded`.

Use official destinations, document changed links in [the link audit](LIENS.md), and preserve personalised names and URLs during migrations. Catalogue updates must not reinsert deleted shortcuts. Test both a new configuration and an existing customised one.

To check destination responses or update local icons:

```bash
node scripts/check-links.mjs --output /tmp/evportal-links.json
node scripts/fetch-icons.mjs
```

These maintenance commands contact external sites. Icon fetching fills missing logos; `--refresh` also updates existing ones. Keep the [icon provenance](../img/services/README.md) current. A redirect, login page or HTTP 403 alone does not establish that a service has closed or that video playback works on Tesla.

Each translation family in `js/locales/` must contain the same keys and interpolation parameters across all eight languages. Rebuild SEO output after translation edits. Check long labels, Arabic direction, open dialogs and user-entered values. Personal shortcut names and URLs must remain untouched.

## Deployment and verification

Publish the static files with their generated language pages. The QR Worker is deployed separately; its public URL belongs in `js/config.js`, and its allowed origins must match the portal host. See the [relay instructions](../relay/README.md) and [multilingual SEO guide](SEO-MULTILINGUE.md).

After publishing, the production checks can verify the deployed version:

```bash
npm run test:production -- --frontend-only
```

This checks the deployed interface without creating a relay session. With a configured public relay, the full command creates temporary synthetic sessions and verifies their deletion:

```bash
npm run test:production
```

Neither production check creates Telegra.ph pages. Run them against a deployment you intend to validate. Search Console verification, Bing verification and sitemap submission are separate actions; generating metadata does not perform them.

For a contribution, describe the user-visible change, compatibility considerations and checks run. Keep production credentials out of the repository and keep generated screenshots out of commits unless they are deliberately selected project assets.

## Versioned releases

EvPortal releases use annotated Git tags in the form `vMAJOR.MINOR.PATCH`, starting with `v2.0.0`, and a matching GitHub release with user-facing notes. Keep the root `package.json` and `package-lock.json` versions aligned. The relay package and the backup data format have independent versions; a site release does not automatically change them.

After checks pass and Pages publishes the intended commit, create the annotated tag on that exact commit and publish the stable release from the existing tag. Record the changes in [CHANGELOG.md](../CHANGELOG.md). Keep published tags fixed: compatible fixes become `v2.0.1`, compatible additions become `v2.1.0`, and incompatible changes require a new major version. The live site can continue receiving updates while the tag preserves the source of the released version; it does not freeze external services or browser storage.

References: [Semantic Versioning](https://semver.org/) and [GitHub release management](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).
