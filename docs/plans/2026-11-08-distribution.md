# Plan: getting the game to players through the official stores

WS10 · 8 Nov 2026 · asked by the PM on Heiko's ruling of 8 Nov: **players get the game from official stores.** Phones
from Google Play and the Apple App Store; TVs from Google Play (Android TV, Google TV, Sony), the Samsung store and the
LG store. Order after the RC (18 Nov): **1** the game server online, **2** phone apps on both stores plus the Android TV
app on Play, **3** the TV-legacy build for 2020–23 sets, **4** Samsung and LG store apps. Cast stays a secondary route.

Read-only on code. Every fact is marked **CITED** (an official page, linked, read 8 Nov), **CODE** (read in this repo
at `1a356da6`) or **INFERRED** (my reasoning). Sizes are estimates. Nothing was signed up for, downloaded or paid.
Builds on the [TV-platforms spike](../spikes/2026-11-08-tv-platforms.md); its Cast-first order is superseded by this
ruling.

## The plan on one screen

| Step | What ships | Size | Dates (proposed) | Lanes |
|---|---|---|---|---|
| 0 | Heiko opens accounts, a domain and a host; privacy policy text | his time, no lane work | **now – 18 Nov**, alongside the RC | Heiko, PM |
| 1 | The game server online at `https://<domain>` | 3 days | **Thu 19 – Mon 23 Nov** | WS4 (deploy, CI), WS3 (server edits) |
| 2 | Phone apps (iOS, Android) and the Android TV app; TV-first join | 9 working days + store review | **Tue 24 Nov – Fri 4 Dec**, submit 4 Dec; live about **8–16 Dec** | WS4, WS3, WS2, WS10 (store art) |
| 3 | TV-legacy build for 2022–23, then 2020–21 | 3–5 days, then 1–2 weeks | **Mon 7 – Fri 11 Dec**, then **14 Dec – Fri 8 Jan** | WS4 |
| 4 | Samsung (Tizen) and LG (webOS) store apps | 1 week + certification | **Mon 11 – Fri 15 Jan 2027**, submit 15 Jan | WS4 |

**Three findings change the shape of the work:**

1. **Samsung does not accept an app that just loads our website.** "Basically, hosted application is not allowed to
   submit due to security policy" ([Samsung FAQ](https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html)).
   The Tizen app must carry the web build inside it. The same holds for the iOS app in practice (Apple 4.2, below).
   So **every store app needs a fixed server address and a protocol version check**, because an installed app can be
   older than the server.
2. **A new Samsung seller can launch in the United States only.** New members are Public Sellers, who "can launch TV
   application services only in the United States"; anything else needs "an offline contract with Samsung HQ or a
   local subsidiary" ([Samsung, membership](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html)).
   If Europe matters for step 4, Heiko should start that conversation in December.
3. **A new *personal* Google Play account cannot publish straight away.** It must "run a closed test for their app
   with a minimum of 12 testers who have been opted in continuously for at least 14 days", then apply for production,
   which Google reviews in "seven days or less"
   ([Play Console help](https://support.google.com/googleplay/android-developer/answer/14151465)). An organisation
   account skips this but needs a D-U-N-S number. **This choice is step 0's most urgent.**

## Step 0 · Accounts, fees and decisions for Heiko (now – 18 Nov)

| Account | Fee | Paid? | Individual or organisation | Source |
|---|---|---|---|---|
| Apple Developer Program | "annual fee is 99 USD" | **paid, yearly** | individual (his legal name shows as the seller) or organisation (legal entity with a D-U-N-S number; "We don't accept DBAs, fictitious businesses, trade names, or branches") | [Apple enrolment](https://developer.apple.com/support/enrollment/) |
| Google Play Console | "US$25 one-time registration fee" | **paid, once** | personal (government ID; the 12-tester, 14-day rule) or organisation (D-U-N-S, organisation document, verified phone) | [fee](https://support.google.com/googleplay/android-developer/answer/6112435), [identity](https://support.google.com/googleplay/android-developer/answer/10841920) |
| D-U-N-S number (organisation route only) | "free in most jurisdictions" | free | — | [Apple enrolment](https://developer.apple.com/support/enrollment/) |
| Samsung Developer account + TV Seller Office | not found (searched membership, FAQ and process pages) | unknown | "Company or Business" or "Individual" | [Seller group](https://developer.samsung.com/tv-seller-office/guides/membership/managing-seller-group.html) |
| Samsung partner contract (outside the US) | not published | unknown | company | [membership](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html) |
| LG Seller Lounge | not found (registration guide, ecosystem page, FAQ) | unknown | "Individual Seller" or "Corporate Seller" | [LG registration](https://seller.lgappstv.com/seller/guide/sellerRegistration.lge) |
| A domain name | registrar's price | **paid** | — | INFERRED |
| Hosting | see step 1 | **paid in practice** (the free tiers sleep, below) | — | CITED in step 1 |
| Anthropic API key for the live server | usage-based, as today | **paid** | — | CODE: `ANTHROPIC_API_KEY` (SEAMS line 33) |
| Optional: Samsung Remote Test Lab | "Sign up - it's free!"; credit rules not readable | free | — | [Remote Test Lab](https://developer.samsung.com/remote-test-lab) |
| Optional: Google Cast developer (Cast is secondary) | "$5 developer account registration fee" | paid | — | [Cast registration](https://developers.google.com/cast/docs/registration) |

**Decisions only Heiko can make, by 18 Nov:**

- **Personal or organisation accounts** for Apple and Google. Organisation avoids the 14-day test and shows a company
  as the seller, but needs a legal entity and a D-U-N-S number first. Personal is faster to open, and the 14-day test
  then runs inside step 2 (the dates below allow for it).
- **The domain**, and **the hosting provider** from step 1's table.
- **A privacy policy and a contact address.** Both stores require a policy link in the listing and inside the app
  ([Play](https://support.google.com/googleplay/android-developer/answer/10144311),
  [Apple 5.1.1](https://developer.apple.com/app-store/review/guidelines/)). Apple 1.2 also requires "Published contact
  information".
- **Whether to start a Samsung partner contract** for countries outside the US (finding 2).

## Step 1 · The game server online (Thu 19 – Mon 23 Nov, 3 days)

### What our server needs (CODE)

- **One Node 22 process** (`apps/server/src/index.ts`) that serves the web build and the WebSocket at `/ws`. It
  reads `PORT`, writes game records to `MULE_RECORD_DIR`, and needs `ANTHROPIC_API_KEY` for Claude seats.
- **Rooms live in memory** (`packages/tabletop/src/registry.ts`). So: **exactly one instance, always on**. A second
  instance would split rooms; a restart or deploy ends every live game. Clients reconnect with a growing pause
  (`apps/web/src/net/client.ts`, at most 5 s) and seats come back by token, but only to the same process.
- **Health check** exists: `GET /healthz` returns `{ ok, rooms }`.
- **Sessions last 60–90 minutes** on long-lived WebSockets.

### Hosting shapes compared (CITED, no provider chosen)

| | WebSocket limits | Always on, one instance | Disk for records | EU region | Free tier |
|---|---|---|---|---|---|
| [Fly.io](https://docs.fly.io/reference/configuration) | configurable `idle_timeout`; no max published | `auto_stop_machines` "default … is off" | volume, one Machine ([docs](https://docs.fly.io/volumes/overview)) | ams, cdg, fra, lhr, arn | none for new organisations ([pricing](https://docs.fly.io/about/pricing)) |
| [Render](https://render.com/docs/websocket) | "does not enforce a maximum duration"; connections close on deploy | free plan sleeps after 15 min ([free](https://render.com/docs/free)) | paid plans; a disk blocks multiple instances and zero-downtime deploys ([disks](https://render.com/docs/disks)) | Frankfurt | yes, sleeps |
| [Railway](https://docs.railway.com/networking/public-networking/specs-and-limits) | WebSockets "can stay open indefinitely, even while idle" | sleep only when "Serverless" is enabled | one volume, no replicas ([volumes](https://docs.railway.com/reference/volumes)) | Amsterdam | $1 credit a month |
| [Cloud Run](https://docs.cloud.google.com/run/docs/triggering/websockets) | **request timeout max 60 min**; clients must reconnect | min-instances "best-effort"; max-instances "can be exceeded for a brief period" | Cloud Storage FUSE, "not … fully POSIX" | Frankfurt, Netherlands, Zurich, … | yes |
| [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/ingress-overview) | "Request time out is 240 seconds"; longer idle only with premium ingress | `minReplicas` ≥ 1, "a target amount, not a guarantee" | Azure Files | yes (list not checked) | monthly free grant |
| VPS (e.g. [Hetzner](https://docs.hetzner.com/cloud/general/locations/)) + [Caddy](https://caddyserver.com/docs/automatic-https) | none but ours | we run it: process manager, restarts, OS updates | local disk | Falkenstein, Nuremberg, Helsinki | none found |

INFERRED reading for Heiko's choice: our one-process, in-memory design fits hosts that keep one instance up without
timeouts on long connections (Fly.io, Railway, a paid Render instance, a VPS). Cloud Run's 60-minute cap and Azure's
240-second request timeout would force mid-game reconnects, and their "best effort" single-instance wording risks
splitting a room. The free tiers sleep, which ends games, so production is paid in practice.

### The work

- **Container and deploy** from CI: build the web app, start the server with `PORT`, secrets set in the host, records
  on a volume (or dropped in production if Heiko prefers). Deploys end live games, so deploy at a quiet hour or add a
  drain later. WS4 (CI owner). **1.5 days.**
- **Domain and TLS**, and two files at the domain root for app links: Apple's
  `/.well-known/apple-app-site-association` ("You must host the file using https:// with a valid certificate and with
  no redirects", [Apple](https://developer.apple.com/documentation/xcode/supporting-associated-domains)) and Android's
  `/.well-known/assetlinks.json`, served as `application/json` without redirects
  ([Android](https://developer.android.com/training/app-links/configure-assetlinks)). WS3's `server.ts`. **0.5 day.**
- **Server edits for store apps** (CODE: `server.ts` sends no CORS headers and checks no origin). An installed app
  runs from its own origin, so `POST /rooms` needs `Access-Control-Allow-Origin` for the app origins. The WebSocket
  needs an origin allow-list. WS3 named edits, WS4 reviews. **0.5 day.**
- **A protocol version** in the handshake. The server answers an older app with a clear "Update the app" message,
  never a broken game. Today the protocol has no version (CODE: `packages/tabletop/src/protocol.ts`). WS4 owns
  tabletop; WS3 owns `server.ts`. **0.5 day.**

## Step 2 · Phone apps and the Android TV app (Tue 24 Nov – Fri 4 Dec)

### What we ship

- **Phones: Capacitor**, as the stack plan says (`docs/technical-plan.md`, "Capacitor wrapping the web client").
  Capacitor 8 is current: Android `minSdkVersion = 24`, `targetSdkVersion = 36`
  ([8.0 update](https://capacitorjs.com/docs/updating/8-0)); iOS "15+ is supported", "Xcode 26.0+ is required"
  ([iOS](https://capacitorjs.com/docs/ios)). Play requires new apps to "target Android 16 (API level 36)"
  ([target SDK](https://developer.android.com/google/play/requirements/target-sdk)); Apple requires "Xcode 26 or later
  using an SDK for iOS 26" ([upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)). The web
  build is bundled in the app, not loaded from the server (Apple 4.2 and finding 1).
- **Android TV: a small native app holding a WebView**, not a Trusted Web Activity. Google's TV rule: "For web content,
  the app must only use WebView components. The app must not attempt to launch a web browser app" (TV-WB,
  [TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality)). A TWA's content is
  "rendered by the user's browser"
  ([TWA](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)), so it fails TV-WB.
  The app needs:
  - `CATEGORY_LEANBACK_LAUNCHER` (TV-ML);
  - a "320x180 pixel full-size banner" (TV-LB);
  - touchscreen "not required" (TV-MT), or the app "doesn't appear in Google Play on TV devices"
    ([create](https://developer.android.com/training/tv/get-started/create));
  - five-way D-pad navigation (TV-DP);
  - a minimum SDK of 31 or lower (TV-PS);
  - an App Bundle (TV-G1);
  - 32- and 64-bit with 16 KB pages (TV-G6);
  - a target of "Android 14 (API level 34) or higher"
    ([target SDK](https://developer.android.com/google/play/requirements/target-sdk)).

  Capacitor documents nothing for Android TV, so a plain Android WebView project is the safer shape (INFERRED). It can
  live in the same Play listing as the phone app or have its own.
- **Which WebView a 2020 Android TV runs:** not documented. Google says WebView updates through Play "at the same
  cadence as Chrome", but the statements are scoped to mobile
  ([WebView](https://developer.chrome.com/docs/webview)). The first real device tells us. If it is old, step 3's
  legacy build applies there too.

### Store requirements and review

| | Google Play (phones and TV) | Apple App Store |
|---|---|---|
| Format and signing | App Bundle ([AAB](https://developer.android.com/guide/app-bundle)); new apps are enrolled in Play signing by default ([signing](https://support.google.com/googleplay/android-developer/answer/9842756)) | built with Xcode 26 / iOS 26 SDK |
| Listing | privacy policy link; [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469) (required even when nothing is collected); [IARC content rating](https://support.google.com/googleplay/android-developer/answer/9859655); [target audience](https://support.google.com/googleplay/android-developer/answer/9893335) | privacy policy URL (required); [App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) ("required to submit new apps and app updates") |
| TV extras | opt in under Advanced settings → Form factors → Android TV; reviewed against the TV quality guidelines; "Mention 'Android TV' in your app's description" ([distribute](https://developer.android.com/training/tv/publishing/distribute)); a 1280×720 TV banner and at least one TV screenshot ([listing](https://support.google.com/googleplay/android-developer/answer/9866151)) | — |
| Wrapper policy | no apps "whose primary purpose is to provide a webview of a website without permission"; no apps with "limited functionality and content" ([spam](https://support.google.com/googleplay/android-developer/answer/9899034), [minimum functionality](https://support.google.com/googleplay/android-developer/answer/9898783)) | 4.2: "elevate it beyond a repackaged website"; it must be "app-like" ([guidelines](https://developer.apple.com/app-store/review/guidelines/)) |
| Chat and AI | — | **1.2** covers "AI content creation apps": "A method for filtering objectionable material", "A mechanism to report offensive content", "The ability to block abusive users", "Published contact information". **5.1.2(i)**: disclose sharing "with third-party AI, and obtain explicit permission" |
| Review time | "up to 7 days or longer in exceptional cases" ([review](https://support.google.com/googleplay/android-developer/answer/9859751)); TV review time not published | "at least 50% of submissions in less than 24 hours and 90% in less than 48 hours" ([App Review](https://developer.apple.com/distribute/app-review/)) |
| Beta | closed testing; **12 testers × 14 days** for new personal accounts | TestFlight, "up to 10,000 external testers"; "A review is required only for the first build" |

**Where we stand on Apple 1.2 and 5.1.2 (CODE):**

- **Filtering exists:** the chat runs through a family filter (`apps/server/src/family-filter.ts`).
- **No report or block control found:** a grep of `apps/web/src/chat` for mute/report/block came back empty. The RC
  plan lists a mute button.
- **Players' chat lines reach Anthropic:** they go into Claude seats' prompts ("The last chat lines you heard",
  `apps/server/src/brain/social-spike.ts`). So the app needs a disclosure and an explicit OK before a player chats at
  a table with Claude seats.

### What the board and phone pages must change: a remote-friendly join

**Today (CODE):** the host's phone creates the room (`POST /rooms`). The TV page then asks for the 4-letter code
through a text field (`apps/web/src/table/TableApp.tsx`, `PickRoom`), which means typing with a remote.

**Proposed: the TV makes its own room; nobody types on a TV.**

1. When the TV app opens, it calls the existing `createRoom()` (`client.ts`) and attaches as the board. It then shows
   the lobby that already exists: a big QR code and the 4-letter code (`TvLobby`, `components/Qr.tsx`).
2. Phones scan the QR code. The first phone to join is the host. That is today's rule: "The host is the first
   connected human" (`packages/tabletop/src/room.ts`).
3. The room stays open while the TV waits. A room counts as idle only when "no human and no board is connected"
   (`room.ts`), so an attached TV keeps it.
4. After a game, the TV offers one focusable **New game** button, which makes a fresh room.

This needs no server or protocol change; the work is in WS4's `TableApp.tsx`. A phone can still create a room
itself for play without a TV.

**For the remote:**

- **One focusable control at a time, with a clear focus ring.** Google TV-DP needs "five-way D-pad" navigation.
  LG requires "4-way navigation keys (Up, Down, Left, Right), OK, and Back"
  ([LG checklist](https://webostv.developer.lge.com/distribute/app-self-checklist)), and its Magic Remote apps "MUST
  also support 5-way mode" ([LG](https://webostv.developer.lge.com/develop/guides/magic-remote)).
- **Back on the lobby leaves the app.**
  - Samsung: "on the application home page, clicking the return key closes the application"
    ([Samsung checklist](https://developer.samsung.com/smarttv/develop/development-checklist/common.html)).
  - LG 6.0+: "show a popup asking whether to exit the app"
    ([LG back button](https://webostv.developer.lge.com/develop/guides/back-button)).
  - During a game, Back asks before leaving the table.
- **Lost network shows a message and clears itself.** Samsung CO-CN: "When the network connection is lost, a message
  is shown." / "When the network is reconnected, the network disconnected message is dismissed." The client already
  tracks `reconnecting` (`client.ts`); the TV needs a visible state for it.

**Phones:**

- **A scanned QR code opens the app if installed, otherwise the website.** That is App Links and Universal Links
  ([Capacitor deep links](https://capacitorjs.com/docs/guides/deep-links)), using step 1's `.well-known` files. The
  web page shows store badges and keeps "play in the browser".
- **Fixed server address in store apps.** `socketUrl`, `createRoom` and the QR link all use the page's own origin
  (CODE: `client.ts` `socketUrl`, `Qr.tsx` `window.location.origin`). In an installed app that origin is local, so all
  three need the server's public address from build config. **The QR code on every TV must carry
  `https://<domain>/?room=CODE`.**
- **Orientation lock to landscape** in the native shell (the stack plan already expects it).

### Work and sizes

| Piece | Owner | Size |
|---|---|---|
| Server address from build config; QR uses the public domain | WS4 | 1 day |
| TV-first room, remote focus, Back and lost-network states on `/table` | WS4 (screens); WS10 can mock the focus states if asked | 2 days |
| Capacitor shell for iOS and Android: orientation, deep links, bundled build, store builds in CI | WS4, plus an owner ruling for the new `apps/` paths | 2.5 days |
| Android TV WebView app: leanback, banner, D-pad, Back, AAB | WS4, plus an owner ruling | 2 days |
| Chat report/block and the AI disclosure and consent (Apple 1.2, 5.1.2) | WS2 (brain) and the chat screen's owner | 1.5 days |
| Store art: app icon, TV banner 320×180, Play TV banner 1280×720, screenshots | WS10 | 1.5 days |
| Store listings, Data safety, IARC, App Privacy | Heiko with the PM (answers only he can give) | 0.5 day |

Lanes work in parallel, so the elapsed time is about 9 working days.

**Dates:**

- **Submit Fri 4 Dec.**
- **Apple:** live about **Tue 8 Dec**, if the 48-hour figure holds.
- **Play with an organisation account:** about **Fri 11 Dec**, at Google's 7-day ceiling.
- **Play with a personal account:**
  1. upload the first build to closed testing by **Wed 25 Nov**, with 12 testers;
  2. apply for production on **Wed 9 Dec**;
  3. live by about **Wed 16 Dec**.
- **Android TV:** its separate TV review has no published time.

## Step 3 · The TV-legacy build (Mon 7 Dec – Fri 8 Jan)

This is sized in the [TV-platforms spike](../spikes/2026-11-08-tv-platforms.md) §4, and it is the same work for the
Samsung and LG store apps:

- **L1, for 2022–23 sets (Chromium 85–94):**
  - a lower JS target and an `.at()` polyfill;
  - flattened `@layer`;
  - fallbacks for container queries, `:has()`, the individual transform properties and `dvh`.
  - **3–5 days, Mon 7 – Fri 11 Dec.**
- **L2, for 2020–21 sets (Chromium 68–79):** on top of L1.
  - **1–2 weeks, Mon 14 Dec – Fri 8 Jan**, with the holidays in between.

Both are WS4's. Measured in the spike: the lowered, flattened build draws the same pixels as today's in a current
Chromium.

## Step 4 · Samsung and LG store apps (Mon 11 – Fri 15 Jan 2027)

| | Samsung (Tizen) | LG (webOS) |
|---|---|---|
| Package | `.wgt` built with `tizen package -t wgt` ([CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html)); author and distributor certificates, signed in with a Samsung Developer account ([certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)) | `.ipk` built with `ares-package` ([CLI](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)); `appinfo.json` with id, title, `type: web`, main, icon, version ([appinfo](https://webostv.developer.lge.com/develop/references/appinfo-json)) |
| Hosted page allowed? | **No**: package the build (finding 1) | **Yes**: "hosted web apps" are a documented type ([app types](https://webostv.developer.lge.com/develop/getting-started/web-app-types)). Packaged is still safer for older sets (INFERRED) |
| Oldest TV | `required_version` in `config.xml`; the app "launches on devices using lower platform versions, but unsupported API features do not work" ([FAQ](https://developer.samsung.com/smarttv/develop/faq/specifications-and-feature-support.html)); release chosen per model group | no per-version field found |
| Remote | return key: back a page, close on the home page (CO-US-05); keyCode 10009 ([remote](https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html)) | Back keycode 461; `disableBackHistoryAPI`; exit popup on 6.0+; 5-way and pointer modes |
| Certification | Submitted → Testing → Launched; time "depends on tester availability and the number of certification rounds"; phased rollout 3 % → 10 % → 100 % over three weeks ([Seller Office](https://developer.samsung.com/smarttv/develop/distribute/seller-office.html)) | pretest, function test, content test; the self-checklist upload is mandatory ([approval](https://webostv.developer.lge.com/distribute/app-approval-process)); duration not published |
| Reach | US only without a partner contract (finding 2) | "accessible in 36 countries" ([ecosystem](https://webostv.developer.lge.com/distribute/app-ecosystem)) |
| Test before submitting | Remote Test Lab, free sign-up | webOS TV simulator (versions 22–26, 6.0); a "webOS Cloud Test Lab" in Seller Lounge (cost not stated) |

**Work:** a Tizen package and a webOS package around the legacy build, vendor key handling, and certification fixes.
**About 1 week**, WS4, plus an owner ruling for the new packaging paths. Certification time is unpublished at both
vendors, so no live date is promised.

## Lanes and ownership

**Existing owners (`.handover/SEAMS.md`):**

- **WS4:** `apps/web/**`, `packages/tabletop/**`, `packages/ui/**` and CI.
- **WS3:** `apps/server/src/server.ts` and `packages/protocol`.
- **WS2:** `apps/server/src/brain/**` and the API key.

**Needs a PM ruling:**

- **New paths with no owner yet:** the native shells and TV packages (for example `apps/mobile`, `apps/tv-android`,
  `apps/tv-tizen`, `apps/tv-webos`) and the deploy config.
- **Recommendation:** WS4 owns them, as the TV and phone screens and CI owner. Server edits stay WS3 named edits.

**WS10:** store art in step 2, and focus-state mocks on request.

## Not found, and what would settle it

- **Fees:** Samsung Seller Office, Samsung partner terms, LG Seller Lounge. Settled when Heiko opens the account pages.
- **Review times:** Android TV review, Samsung and LG certification. Settled by the first submission.
- **Whether Android TV's WebView updates through Play:** settled by reading the user agent on the first real device.
- **Samsung Remote Test Lab credits:** the pages render by script and could not be read automatically.
- **Sony's per-year models:** Sony's sites block automated reading (TV spike §2). Settled by one manual look.
- **Quotes from `support.google.com` and Samsung pages** came through a summarising fetch. Re-read them before
  quoting any word for word in a listing or a contract.
