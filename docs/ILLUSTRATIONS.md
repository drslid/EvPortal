# EvPortal project illustrations

## Social cover

[`img/evportal-social.png`](../img/evportal-social.png) is a promotional illustration generated with the built-in image generation tool, using a browser capture of EvPortal and a synthetic favorites selection as the visual reference. It is not a photograph of a Tesla or evidence of a vehicle compatibility test. The original output was proportionally resized to 1280 × 640 and compressed for publication; the design was not retouched.

The cover is used by the README and the website’s Open Graph / Twitter metadata. The GitHub repository’s own **Settings → Social preview** is separate: upload this file there to use it when sharing the repository URL. GitHub recommends 1280 × 640 and a PNG, JPEG or GIF smaller than 1 MB. [GitHub documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).

### Generation prompt

```text
Use case: ads-marketing / product-mockup.
Create a new polished GitHub and social sharing cover for the existing EvPortal project. Output a wide 1280 × 640 image (2:1). The attached image is a reference of the real current application, not a background to preserve. This is a promotional illustration, not a photograph of a tested vehicle.
Use the project's existing dark graphite, warm copper/peach accents and white EV PORTAL wordmark shown in the reference. Make an elegant restrained product composition: a large crisp wordmark and the exact English subtitle "Your shortcuts for Tesla." with a landscape touchscreen displaying the supplied dashboard, and a subtle flowing road/light motif that suggests an electric journey. Background near-black with very soft warm illumination and ample breathing room. The application display should be the visual focus; preserve its centered logo, familiar service favicons, sparse category navigation, and bottom fullscreen control. Favor faithful readable UI, no invented apps, telemetry, maps, battery meters or extra controls. The dashboard can be framed in a simple thin dark device bezel, not a claimed model of Tesla hardware. No car interior, people, additional slogans, badges, claims of official affiliation, QR codes, extra text or watermark. Keep all content inside generous safe margins for social crops. Flat clean typography, professional editorial product visual, visually attractive without glossy excessive 3D or busy decoration.
```

## Application capture

[`img/evportal-dashboard.png`](../img/evportal-dashboard.png) is an actual browser screenshot with synthetic favorites. [`img/evportal-compact.png`](../img/evportal-compact.png) shows the same selection with small shortcuts and hidden names. Neither contains user data. Recreate both with `node scripts/capture-preview.cjs` after building the localized pages, then run `npm run build:seo` again to update the publication fingerprint. These captures document the web interface rather than a test inside a physical vehicle.
