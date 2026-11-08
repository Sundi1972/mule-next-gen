# Spike: can the TV page (`/table`) run on 2020+ smart TVs?

WS10 · 8 Nov 2026 · asked by the PM on Heiko's ruling of 8 Nov: measure now, build after the 13 Nov play-test,
**Cast first** (Android TV, Google TV, Sony, Chromecast), **then Samsung and LG built-in browsers back to 2020.**
Read-only on code; WS4 owns the TV page and the `apps/web` build.

Every claim below is marked **MEASURED** (run or counted on our build, here), **CITED** (a vendor page, linked) or
**INFERRED** (my reasoning from the two). Nothing was run on a real TV.

## The answer in one screen

| Target | Engine | `/table` as built today | What it needs |
|---|---|---|---|
| Samsung 2024, 2025 · LG webOS 24, 25 | Chromium 108, 120 | **should work** (INFERRED) | nothing; one cosmetic glow lost below Chromium 111 |
| Samsung 2022, 2023 · LG webOS 22, 23 | Chromium 85, 87, 94 | **unstyled page** (INFERRED): 85 % of the CSS sits in `@layer`, which these engines drop | a TV-legacy build, about 3–5 days |
| Samsung 2020, 2021 · LG webOS 5, 6 | Chromium 68, 69, 76, 79 | **blank page** (INFERRED): the JS does not parse below Chromium 85 | the TV-legacy build plus older CSS fallbacks, about 1–2 weeks more |
| Chromecast, Google TV, Android TV with Cast (Sony 2021+, by an unverified source) | not published by Google | unknown until measured on a device | tab-casting from desktop Chrome works with zero build; a custom Cast receiver is about 2–3 days plus Heiko's $5 registration |

**Recommendation:** check on a real TV and measure tab-cast latency first (16 Nov), then the Cast receiver if Heiko
registers (17–19 Nov), then the TV-legacy build for 2022–2023 (20–26 Nov), and decide 2020–2021 on those numbers
(27 Nov). Details in [§4](#4-gaps-options-sizes-and-build-order).

## 1. What our TV page requires (MEASURED)

Measured on a `vite build` of `apps/web` at `936f22043` (`feat/strategist`, 8 Nov). Vite 7.3.7 and Tailwind 4.3.3 from
`pnpm-lock.yaml`. `apps/web/vite.config.ts` sets no `build.target`, so Vite's default `baseline-widely-available`
applies (chrome107 / edge107 / firefox104 / safari16); WS4 confirmed it was never chosen. Tailwind 4 states its own
floor as Chrome 111, Safari 16.4, Firefox 128.

Output: `index-*.js` 945,260 B (292,760 B gzip), `index-*.css` 93,144 B, a 9.5 KB landscape worker (phone only, per
WS4), and `art/`.

### JavaScript syntax

Counted with a Babel AST walk over the bundle; the Chrome version is from `@babel/compat-data` 7.29.7.

| Feature | Uses | First Chrome |
|---|---:|---|
| optional chaining `?.` | 696 | 80 (Babel lists 91 for a bug in 80–90) |
| nullish `??` | 503 | 80 |
| logical assignment `??=` | 5 | **85** |
| class fields | 52 | 74 |
| object spread | 410 | 60 |
| optional catch binding | 32 | 66 |
| regex `\p{…}` | 1 | 64 |
| `**` | 7 | 52 |
| `<script type="module">`, `import.meta` | 1 | 61 |

**Parse floor: Chromium 85.** One unparseable token and the whole bundle fails: a blank page, no partial render.

### Runtime APIs

- `Array.prototype.at` (`.at(-1)`), used by our own code on the TV path (event-show segments, the caption join):
  **Chromium 92.** Below that it throws when an event show plays. A polyfill is about 1 KB.
- `ResizeObserver` (12 uses; the TV fit depends on it): 64. `matchMedia` (7), `localStorage`, `WebSocket`
  (one connection): old. `AudioContext` with a `webkitAudioContext` fallback, resumed on a gesture.
  `flatMap` and `Object.fromEntries`: 69 and 73. WebP art: 32.
- Worker and `OffscreenCanvas`: guarded and phone-only (WS4).
- Fonts load from `fonts.googleapis.com`: the TV needs internet access, as it already does.

### CSS

Counted in the built stylesheet; the Chrome version is from `caniuse-lite` 1.0.30001817.

| Feature | Uses | First Chrome | Below that |
|---|---:|---|---|
| `@layer` (properties, theme, base, components, utilities) | **85 % of CSS bytes** | 99 | the whole block is dropped: unstyled page |
| `@property` | 70 | 85 | Tailwind's `--tw-*` defaults are unset; some shadows and transforms are lost |
| `color-mix()` | 115 | 111 | 57 sit behind `@supports (color:color-mix(…))` after a plain-colour fallback (the other 57 are the guards); **1 is unguarded**, the `hurry` keyframe glow |
| `:has()` | 2 | 105 | rule ignored |
| `@container` | 7 | 106 | rule ignored |
| `translate` / `scale` / `rotate` properties | 19 | 104 | transform ignored |
| `dvh` (the TV root's `h-dvh`) | 1 | 108 | height falls back to auto |
| `:where()`, `:is()` | 9, 3 | 88 | rule ignored |
| flex/grid `gap` | 56 | 84 (flex) | flex items touch |
| `aspect-ratio` | — | 88 | |
| `oklch()` | 0 | — | Tailwind compiled the palette to hex |

**CSS floor: Chromium 99**, for `@layer`. Below 108 the page also loses the details above, piece by piece.

**So `/table` as built needs Chromium 108 to look right, and 99 to be usable.** The table in the summary follows from
that.

## 2. What each target runs (CITED)

### Samsung (Tizen)

Source: [Samsung, Web Engine Specifications, Table 1](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html),
"the Web engine version provided with each TV model year".

| Model year | Tizen | Chromium | `@layer` | `@property` | `color-mix()` |
|---|---|---|---|---|---|
| 2020 | 5.5 | M69 | No | No | No |
| 2021 | 6.0 | M76 | No | No | No |
| 2022 | 6.5 | M85 | No | Yes | No |
| 2023 | 7.0 | M94 | No | Yes | No |
| 2024 | 8.0 | M108 | Yes | Yes | No |
| 2025 | 9.0 | M120 | Yes | Yes | Yes |
| (2026) | 10.0 | M130 | Yes | Yes | Yes |

The feature columns come from the same page (Tables 31, 122, 37), parsed from the raw HTML because a text extraction
shifts its rowspans. WebSocket: Yes in every year. JavaScript: the page lists only ES6; the
[FAQ](https://developer.samsung.com/smarttv/develop/faq/specifications-and-feature-support.html) says "Samsung TVs
partially support ES6 JavaScript".

**Not found:** which engine the TV's own "Internet" browser app uses. The only statement,
[Samsung's user-agent page](https://developer.samsung.com/internet/user-agent-string-format.html), is from the 2015
era. Everything above is the **web-app** engine; that the browser matches it is INFERRED.

### LG (webOS TV)

Source: [LG, Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).

| Release year | webOS | Chromium |
|---|---|---|
| 2020 | 5.x | 68 |
| 2021 | 6.x | 79 |
| 2022 | 22 | 87 |
| 2023 | 23 | 94 |
| 2024 | 24 | 108 |
| 2025 | 25 | 120 |
| (2026) | 26 | 132 |

- **Release year is the platform's, not the TV's.** LG's forum: "The release year refers to the release year of each
  platform version, not the TV release year"
  ([thread](https://forum.webostv.developer.lge.com/t/are-the-documented-model-year-web-os-version-couplings-reliable/8552)).
  A TV's webOS version has to be read off the TV.
- LG publishes no feature list for webOS 4 and later; it points to MDN. Feature support is INFERRED from the
  Chromium version.
- **Built-in browser:** only for webOS 22, from a forum reply not marked as LG staff: "the browser app on webOS TV 22
  uses Chromium 87, the same web engine as the web app"
  ([thread](https://forum.webostv.developer.lge.com/t/debugging-website-in-webos-22/4782)). Nothing for other
  versions.

### Google Cast, Android TV, Google TV, Sony

- **Receiver engine: not published.** Google: "A receiver application is a Chrome application that runs on the
  Google Cast receiver device" ([reference](https://developers.google.com/cast/docs/reference)); it is debugged
  through `chrome://inspect` ([remote debugger](https://developers.google.com/cast/docs/debugging/remote_debugger)).
  The [firmware page](https://support.google.com/chromecast/answer/7124014) gives build numbers only (Chromecast 3rd
  gen 1.56.291998; Chromecast with Google TV UTTA/UTTC builds; Google TV Streamer; "Cast for Android TV"
  1.56.292394). On Android TV the receiver's user agent "contains both "Android" and "CrKey""
  ([Android TV receiver debugging](https://developers.google.com/cast/docs/android_tv_receiver/debugging)).
  **The version can be read from `navigator.userAgent` on the first device we run on.**
- **Custom Web Receiver** ([registration](https://developers.google.com/cast/docs/registration)): needs an app ID
  from the Cast Developer Console; "The $5 developer account registration fee is non-refundable" (one-time is not
  stated). Until published, each test device is registered by serial number and is ready about 15 minutes later,
  after a restart. HTTP is allowed in development; "when the app is published it has to use HTTPS". The Default
  Media Receiver needs no registration but "cannot customize any of the UI"
  ([Web Receiver](https://developers.google.com/cast/docs/web_receiver)), so it cannot show `/table`.
- **Sender:** the Web Sender is "supported on Cast-supported web browsers on Mac, Windows, Linux, ChromeOS, and
  Android devices"; "Casting is not supported on the iOS Chrome browser"
  ([Web Sender](https://developers.google.com/cast/docs/web_sender)). **A host on an iPhone cannot start a cast from
  our web page**; that would need a native iOS sender app.
- **Tab casting** ([Chromecast help](https://support.google.com/chromecast/answer/3228332)): desktop Chrome, same
  Wi-Fi, "You can cast most web content". The page renders on the laptop, so the TV's engine does not matter.
  Latency, resolution and frame rate are not published.
- **Sony:** Google lists Sony as a [Google TV](https://tv.google/products/) and [Android TV](https://www.android.com/tv/)
  partner, without models. A Sony help guide ([jga1](https://helpguide.sony.net/tv/jga1/v1/en-142/print.html)) says
  "Chromecast built-in™ or AirPlay allows you to display (cast) your favourite websites". **Per-year models are
  unverified:** Sony's sites returned HTTP 403 to automated fetches. A search summary of Sony support article
  00275850 says 2020 Bravia is Android TV (Android 9) and 2021 onwards is Google TV. Someone needs to open that article
  in a normal browser.
- **Browser on Android TV:** a standalone browser is optional under the
  [Android 14 CDD §3.4.2](https://source.android.com/docs/compatibility/14/android-14-cdd); the TV section adds no
  browser requirement. So on Cast-first targets, Cast is the way in, not a browser.

## 3. What was run, and what was not

**Not run: the Android TV emulator.** Ruled by the PM, for four reasons. Installing the system image means accepting
Google's SDK licence, which is Heiko's to do. Google documents no Chrome or WebView in the TV images
([image manifest](https://dl.google.com/android/repository/sys-img/android-tv/sys-img2-3.xml): Android TV API 21–31,
33, 34, 36; Google TV API 30, 31, 33, 34, 36). Nothing documents the emulator as a Cast receiver: device registration
is by serial number, and the [Cast Connect codelab](https://developers.google.com/cast/codelabs/cast-connect-atv)
needs a real device. And a current WebView would say nothing about 2020 engines.

**Not run: old Chromium (68–94) on this Mac.** Running a downloaded browser binary was blocked by the machine's
permission policy. Heiko ruled on 8 Nov to skip it: the static analysis above is the evidence, confirmation comes on
real TVs, and the downloaded copies were deleted. Chromium snapshots exist for 68, 69, 76, 79/85/87 (x64 under
Rosetta) and 94, 99, 108, 111, 120 (arm64), if that ruling is ever revisited.

**Not run: Samsung Remote Test Lab.** It needs Heiko's Samsung account, so it is listed as an option only (§4).

**Run (MEASURED), in Playwright's own current Chromium.** The full flow: the host phone starts a game, a second player
joins, and the TV opens `/table`. The lobby is shot, the game started, the election voted through, and the planning
screen shot. This was done twice: once with the build as shipped, and once with the TV-legacy candidate. That
candidate is the JS lowered to `chrome69` by esbuild and the CSS with every `@layer` unwrapped in source order.

- Page errors: 0 and 0.
- Pixel diff, planning screen: 340 of 2,073,600 pixels (0.016 %), all inside the "ROOM xxxx" label: each run gets a
  new room code. **Otherwise identical.**
- Pixel diff, lobby: 4.03 %, all in the QR code, the room code and the join URL's port. **Otherwise identical.**

This proves that lowering and flattening break nothing on a modern engine, for these two screens. It does not prove
anything about an old engine; that is what the real-TV check is for.

## 4. Gaps, options, sizes and build order

Sizes are my estimates (INFERRED) unless marked. The TV page and the `apps/web` build config are WS4's, so every
build change below is WS4's to make or to approve as a named edit.

### Cast

| Option | What it is | Size | Gaps |
|---|---|---|---|
| **C0 · Tab-cast** | Open `/table` in desktop Chrome, "Cast tab" to any Chromecast or Google TV | **zero build**, 0.5 day to measure | latency unmeasured (Google publishes none); needs a laptop at the table; sound goes to the TV |
| **C1 · Custom Web Receiver + sender button** | A receiver page that loads `/table?room=…`, a Cast button on the host phone's lobby | **2–3 days** | Heiko's $5 Cast registration and each test device's serial; HTTPS before publishing; **no sender from iPhone** (Chrome on iOS is unsupported), so iPhone hosts need C0 or a native app; the receiver's Chromium version is unknown until measured, so it may need the legacy build below |

### Samsung and LG built-in browsers

| Option | Serves | What changes | Size |
|---|---|---|---|
| **L1 · TV-legacy build for `/table`** | 2022–2023 (Chromium 85–94); also any Cast receiver in that range | JS target `chrome85` (measured: gzip 294,998 B, +0.8 %) plus an `Array.prototype.at` polyfill; the CSS with `@layer` flattened (by `@csstools/postcss-cascade-layers`, or the source-order unwrap measured above: 93,144 → 93,062 B); `transform` fallbacks for the 19 individual-transform uses; fixed `@media` in place of the 7 `@container` rules (the TV is a fixed 1920×1080 stage); the 2 `:has()` rules by hand; `100vh` for `dvh`. Served by a few lines in `index.html` that pick the bundle by feature test (`window.CSSLayerBlockRule`, `[].at`), or from a separate `/tv` entry | **3–5 days** plus real-TV testing |
| **L2 · 2020–2021 on top of L1** | Chromium 68–79 | JS target `chrome69` (measured: esbuild lowers it cleanly; gzip 298,047 B, +1.8 %; leaves only ES2019 and older); margins for the 56 flex `gap` uses; replacements for 12 `:where`/`:is` selectors and `aspect-ratio`; unconditional `--tw-*` defaults where `@property` is missing | **+1–2 weeks** |

**Not available off the shelf:** lightningcss 1.32 (already in the toolchain) cannot do L1's CSS. It does not flatten
`@layer`, does not lower `color-mix()` with `var()`, and leaves `@property`, `:has()`, `@container` and the individual
transforms in place (MEASURED: its chrome69, 85 and 99 outputs keep all of them).

**Frame cost on weak TV CPUs: unmeasured.** The closest proxy is the phone trace from #817 at 4× CPU throttle (p95
16.8 ms per frame, 3.6 ms after #819). TV SoCs from 2020–2022 are likely slower than that proxy; the first real-TV run
should record a performance trace. Cast receivers are inspected through `chrome://inspect` (cited above). Samsung
and LG provide remote web inspectors in developer mode; that needs a developer-mode TV, so it was not checked here.

### Options that need Heiko

- **Samsung Remote Test Lab:** real Samsung TVs by model year in the browser, on Heiko's Samsung account. It is
  the cheapest way to check 2020–2023 Samsung without owning those TVs.
- **Cast Developer Console:** $5, his account, and his device serials. Needed for C1 only.
- **Which TV he owns:** the first check runs on it.

### Recommended order, after the 13 Nov play-test

1. **Mon 16 Nov · real-TV check and C0 (0.5 day).** Open `/table` in the browser of whatever TV Heiko has. Record
   its make, year and `navigator.userAgent`. Tab-cast from desktop Chrome to a Chromecast or Google TV and measure the
   latency with a phone stopwatch video. If Heiko signs up, run the same on Samsung Remote Test Lab for 2022 and 2024.
   This turns every INFERRED verdict above into a measurement or a correction.
2. **Tue 17 – Thu 19 Nov · C1 Cast receiver**, if Heiko registers. Its first hour reads the receiver's Chromium
   version off a real device. If that version is below 99, C1 waits for L1.
3. **Fri 20 – Thu 26 Nov · L1 TV-legacy build for 2022–2023** (WS4's build). WS10 can draft the CSS fallbacks if WS4
   asks.
4. **Fri 27 Nov · decide L2 (2020–2021)** on the numbers: how many of the target TVs are 2020–21, and what L1 cost.

## How this was measured

All measurement files are in WS10's session scratchpad, not committed. To repeat any of it:

- **The build:** `pnpm --filter @mule/web build` at `936f22043`.
- **The JS features:** `@babel/parser` over the bundle, counting node types (`OptionalMemberExpression`,
  `LogicalExpression` with `??`, `ClassProperty`, …). Mapped to Chrome through `@babel/compat-data` 7.29.7's
  `plugins.json`. The APIs by regex over the bundle, then checked by hand on the TV path.
- **The CSS features:** regex counts over the stylesheet; `@layer` bytes measured by brace depth. Mapped to Chrome
  through `caniuse-lite` 1.0.30001817.
- **The legacy JS:** `esbuild --target=chrome69` (and `chrome85`) on the bundle.
- **The legacy CSS:** unwrap every `@layer x{…}` block in place, keeping source order, and drop `@layer a,b;`
  statements.
- **The comparison:** `createMuleServer({ staticDir, seed: () => 7 })` from `apps/server`, driven with Playwright
  through the helpers in `apps/web/e2e/politics-steps.ts`, `reducedMotion: 'reduce'`, 1920×1080. Diffed per pixel
  with a threshold of 24 on summed RGB.
