# Professional asset packs for the colony grounds: what they cost, what we'd gain

*Web research, 6 Nov 2026 (pages read 14:40–15:05 UTC). Nothing bought or downloaded, no accounts made.*

**Question from the sponsor:** "How much is a professional asset pack, and what do we gain?"

**Short answer:** The paid packs cost roughly $4 to $950 per seat per year. None of them removes our real bottleneck, which is modelling a *bespoke* civic building (Hospital, Stadium, Observatory) to a consistent look. They save hours on props, materials and greebles, not on the building itself. In the best case that is **3–6 h out of 25–35 h per building**. The best value today costs nothing: Epic announced on **5 Nov 2026** that the whole Megascans library is free on Fab.

**What "verified" means here:** a price or licence term is quoted only where it was read on the seller's or licensor's own page today. Where a page refused the request (HTTP 429 / 403 / JS-only), the report says so, and anything taken from search snippets is marked **unverified**.

---

## 1. KitBash3D: Lunar Base (and Utopia), or the KitBash3D Library subscription

**1. Seller, URL, price**
- Seller: KitBash3D (KitBash LLC). Product pages https://kitbash3d.com/products/lunar-base and https://kitbash3d.com/products/utopia **could not be read**: HTTP 429 "Too Many Requests" on every attempt (4 tries over about 10 min, plus my own retry). **The perpetual price of a single kit is therefore unverified.** A search snippet gives Utopia as $145 with about 31 models and about 1.6 M polygons. That is a lead, not a reading.
- Subscription prices, read at https://cart-checkout.kitbash3d.com/pages/pricing:
  - Individual (KitBash3D library): "$59 /month" ("Was $119") or "$708 billed yearly".
  - Everything Bundle: "$79 /month" ("Was $159") or "$948 billed yearly".
  - Team: "$79 /seat/month", "Annual billing only", "$948 per seat, billed yearly". The FAQ on the same page says Teams start "at $99/user/month". The page contradicts itself here.
  - Enterprise: "Talk to Sales."

**2. Licence** (read at https://kitbash3d.com/pages/license-text, which is the PDF "KITBASH3D LICENSE AGREEMENT", last modified 6 Apr 2026, pp. 1–12 of 18 read; and https://kitbash3d.com/pages/usage-rights, the PDF "Usage Rights – April 2026")
- Commercial games: **yes.** §1.8: "'Larger Work(s)' means images, videos, and/or interactive experiences which you create separate and apart from the Assets." Usage Rights: "Includes a license for commercial use of assets within 'Larger Works' (e.g., films, games, or advertisements)."
- Rendered images: **yes.** They are a Larger Work.
- Models shipped inside a web game (extractable glTF): **ambiguous, and possibly not allowed on an Individual plan.** §3.2.4: "you may freely distribute and/or make available the Assets as part of the distribution … of a Larger Work … provided that, the Assets were properly incorporated … However, if you want to distribute … Larger Works in which the Assets are included in an editable format that allows the recipient to access, copy and/or modify the Assets, then you need to purchase the necessary Usage Rights to do so." Usage Rights on Individual plans: "You may only deliver finished, non-editable renders or files to clients. You are not permitted to deliver KitBash3D … assets in an editable format." Teams: "may distribute assets in an editable format … provided they are incorporated into a Larger Work." Neither text says whether a .glb served to a browser counts as "editable format". **We would need KitBash's answer in writing.**
- Seats and team size: Individual plans are "for individual artists or single-member legal entities … Organizations of two or more people are not permitted to use Individual plans regardless of the number of users." A company of two or more people has to buy Team at $948 per seat per year. Overview page: https://cart-checkout.kitbash3d.com/pages/licenses.
- Subscription term: "You may only use assets in new projects while your subscription is active." Assets already built into a Larger Work stay usable after cancelling. Perpetual kit licences "grant perpetual rights to use the specific purchased assets in an unlimited number of new projects forever."
- No AI training (§3.2.7).

**3. Formats and polycount:** A search snippet (not a page reading) lists Lunar Base for "Blender, Unreal Engine, Cinema 4D, Unity, 3ds Max, Maya, Houdini, FBX/OBJ" with "28 PBR Materials". Polycount and texture size for Lunar Base were **not read**. KitBash kits are built for film and offline rendering. If the Utopia lead holds (about 1.6 M polys over 31 models, about 50 k each), single modules fit a 150 k-triangle building only when used sparingly. Whole kits, and their 4K–8K textures, are offline-render material, and would need decimating and texture baking for the phone.

**4. What it adds:** Professionally detailed near-future colony modules: command HQ, silos, biodomes, life-support plant. These would make Spaceport, Observatory and rooftop plant read as "built by a studio", and every building would share one material language.

**5. Hours saved:** **3–6 h per building**, mostly on Spaceport and Observatory (hangars, domes, tanks, pads) and on rooftop plant and greebles. About 1–2 h on Park and Hospital. The kit does not contain *our* buildings, so the standing model's massing, facade and five stages remain our work. Fitting the kit into our 12 m places and five stages also costs time back.

**6. Catches:** About $948 per seat per year for a team. The web-glTF licence question is open. The product pages could not be read, so the kit's price and specs are unverified. The sci-fi "lunar outpost" look may out-detail our script-modelled buildings and make them look cheaper beside it. Kits are heavy.

---

## 2. Synty Studios: POLYGON Sci-Fi City (also City, Construction)

**1. Seller, URL, price**
- https://syntystore.com/products/polygon-sci-fi-city: "Regular price $49.99 USD", no discount. The page shows both "Sold out" and an "Add to cart" button, so availability is unclear. 509 unique assets, 24 alternative texture colours, 20 characters, 9 vehicles.
- POLYGON City Pack and POLYGON Construction Pack: pages returned **HTTP 429, not read**. Snippets only, unverified: Construction is "$49.99 USD", "over 550" prefabs including cranes, excavators and trucks.
- Synty Pass subscription: page not read (429). Snippet, unverified: $30/month billed annually.

**2. Licence** (read at https://syntystore.com/pages/end-user-licence-agreement and https://syntystore.com/pages/one-time-purchase-licence, both "As at 9 July 2026")
- Commercial game: **yes.** "Product: any videogame (which will always be covered by your licence)". "The licence is worldwide, and is not limited by game engine, OS, platform or device."
- Renders: **yes** for "promotional materials (graphics, videos or print media) for those Products". The FAQ (https://syntystore.com/community/faq) adds: "it is prohibited to resell our assets rendered as image files".
- Extractable web glTF: **no clause on web, WebGL or extraction at all.** The relevant limits are "You must not share the source files of any Assets outside your team" and no stock or standalone redistribution. Read literally, a web build is allowed. The question is how "source files" applies to a served .glb, and the licence does not address it.
- Seats: "each single licence purchase you make includes five seats for your Team" (Humble Bundle: one). The licence is perpetual for one-time purchases. Synty Pass rights end for further development when the subscription lapses (https://syntystore.com/pages/standard-subscription-licence §12.2–12.3).
- Banned: NFT and blockchain use, generative-AI use, and "Game Creation Software".

**3. Formats:** "Godot 4.6.2 project, Unreal 4.25 project, Unity 2022.3 package, FBX source files". Blender and glTF are not listed, and the FAQ says Synty works in Maya. The packs are low-poly and very light, so they fit easily in real time.

**4. What it adds:** Nothing to our look. The style is flat-shaded, low-poly and palette-textured, the opposite of the "believable detailed miniature" target. Mixing it with Cycles-lit concrete and glass would read as two games.

**5. Hours saved:** **0–1 h per building.** It is usable only as quick blockout or placeholder props.

**6. Catches:** The style mismatch is decisive. It is not Blender-native, and the pages were partly unreadable. This is a poor buy for us.

---

## 3. Quixel Megascans on Fab (Epic Games)

**1. Seller, URL, price:** **Free.** Quixel news, dated 5 Nov 2026: "We're making the full Quixel Megascans library free on Fab." https://quixel.com/news/update-megascans-are-going-free-again (read directly). Buyers since 1 Jan 2025 get refunds. On listing pages the 3D props were already free, for example "Concrete Barrier" at https://www.fab.com/listings/3428eb34-4e96-4a57-86af-2a73dedfe7b7 and "Concrete Debris" at https://www.fab.com/listings/d8c67277-1b86-4bb3-8e93-41032880f3bc. Some surfaces still showed a price of SGD 1.26 the day after the announcement, so the listings had not caught up yet. No subscription exists on any Epic page.

**2. Licence:** Fab Standard License, summary at https://www.fab.com/eula:
- "Use the assets commercially or privately".
- "Commercially distribute your Projects with the Fab assets incorporated into it".
- "Use the assets with any compatible tools (usage is not limited to Unreal Engine)".
- "Share the asset … with your collaborators". No seat number is given.
- Not allowed: "Resell or redistribute the asset for free on a standalone basis".
- Tiers (https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab): Personal applies up to $100,000 USD gross revenue in the last 12 months. "Both pricing tiers … grant you the same scope of rights." For free assets the tier does not matter.
- Commercial game: **yes.** Renders: **yes.**
- Extractable web glTF: **risk, not verified.** The binding EULA text loads client-side and **could not be read**. Secondary quotes of it (an Unreal forum post and the licenseware wiki) say: "you must restrict end users from extracting or otherwise using Content outside of the Project". Nothing defines what counts as restricting. Plain .glb files on a web server probably need at least obfuscation or packing, and **someone must read the binding text before the real-time phase.**

**3. Formats:** "fbx", "gltf", "Converted GLB, glTF, and USDZ", plus texture sets. Texel density 3,000–6,300 px/m on the props checked. Pixel resolution is not stated. These are scans, so props are dense. Use them as-is for offline Cycles renders; for the phone they need LOD or decimation and texture downsizing.

**4. What it adds:** Real scanned concrete, debris, barriers, planters, gravel and ground. That is exactly what the **site, under-construction and damaged/smoking** stages need, and it gives every building the same scanned-material language as Poly Haven. Photoreal material response at dusk is better than hand-made textures.

**5. Hours saved:** **1–3 h per building**, mostly on props and stage dressing: rubble for the damaged stage, barriers and stockpiles for the site stage, and planters. Little is saved on the standing building, and Poly Haven already covers part of the surface library.

**6. Catches:** The extraction clause for the web build is unverified. The scans are heavy. Free policies have changed before (free → paid in 2025 → free again in Nov 2026), so we should take what we need now and record the licence version at download. No people or vehicles of the right kind.

---

## 4. Blender procedural building / facade add-ons (Superhive, formerly Blender Market)

Licence for all of them: Superhive "Standard Royalty Free" (https://support.superhivemarket.com/article/49-standard-royalty-free-license, updated 30 Sep 2026): "make use of the purchased product for personal, educational, or commercial purposes" / "You may not resell, redistribute, or repackage the purchased product without explicit permission". Add-on code may be GPL instead. **The licence has no anti-extraction clause**, and output we generate is our own geometry. The open point is whether a shipped .glb of a *bundled kit mesh* is "redistribution". Generated walls and windows should be fine. No seat limit is stated.

| Add-on | URL | Price today | Blender | What it makes | Real geometry for glTF? |
|---|---|---|---|---|---|
| **Urban World Builder** (EdenWeby 3D) | https://superhivemarket.com/products/urban-world-builder | $18 Standard / $24 Pro / $28 Ultra (the page shows a 25 % coupon) | 4.2–5.2+, "tested on 5.2" | towers, parapets, "True 3D geometric balconies, window frames, parapets, AC units", curtain glass, "domed city hall with portico", emissive lit windows; Geometry Nodes mode only in Ultra | real geometry; glTF export not stated. Code is GPL v3, output is "commercial royalty-free … You Own Your 3D Output". Standard "does not permit reselling or distributing raw 3D mesh files on 3D marketplaces"; Pro and Ultra add redistribution |
| **70s Office: Procedural Curtain Wall Building Generator** (ParametrStudio) | https://superhivemarket.com/products/70s-office-procedural-curtain-wall-building-generator | **$4** | "5.1 - 5.2" | concrete frame, glass curtain wall, slabs and sunshades from a massing cube | yes (Geometry Nodes, realise then export) |
| MBG – Building Generator Geometry Nodes (Abbos Mirzaev) | https://superhivemarket.com/products/mbg-building-geometry-nodes | $50 | "4.4 - 4.5" (5.2 not stated) | apartment block / modern tower, facade layout, window and door distribution, balconies | yes, "game asset generation" mentioned |
| Nterior Facade Addon V3 (Bas architects) | https://superhivemarket.com/products/nterior | $38 (GPL) | "4.2 - 4.5" (5.2 not stated) | parallax lit interiors behind windows, Quick Facade | **no**: interiors are a shader effect (Rayportal is Cycles-only), so only the facade mesh exports |
| Buildify (Pavel Oliva) | https://paveloliva.gumroad.com/l/buildify | free / pay what you want (snippet; page JS-only, **not read**) | 3.2 per CG Channel 2022 | assembles *your* wall and roof kit along footprints | yes |

Rejected: Procedural Building Generator 2 (https://superhivemarket.com/products/pbg-2, $15/$20) has historic styles only, and its page says it "CANNOT … Integrate directly with game engines". Urbaniac! (https://superhivemarket.com/products/building-generator, $39.99 early access) does not name its styles.

**What it adds:** Facade window grids are the most repetitive part of our 16–24 h standing model. A curtain-wall generator gives every civic building the same mullion rhythm, slab edge and glass. For dusk renders only, Nterior's lit parallax rooms would put believable life behind the windows.

**Hours saved:** **2–5 h per facade-heavy building** (Hospital, school, museum, the Observatory base). About 0 h for Park and Stadium. Urban World Builder is the closest fit of the add-ons read: modern towers with real balconies and rooftop AC units, lit windows for dusk, a domed civic hall, and stated testing on our Blender 5.2. Ultra at $28 is the tier that gives the Geometry Nodes mode and the redistribution rights a shipped glTF would want. The $4 curtain-wall generator is a cheap test. The "70s office" style is retro-brutalist and would need restyling toward near-future, which takes back some of the time saved.

**Catches:** These are small sellers with unknown quality and few reviews. MBG and Nterior do not state support for Blender 5.2. Nterior's main effect does not survive glTF export, so it would split the offline and real-time looks. Buildify ships no kit, so it only rearranges modules we would still have to model.

---

## 5. Also checked, briefly

- **BlenderKit: counted as UNREAD, per the lead's ruling.** Every blenderkit.com page answers with a 301 redirect to a different host, blendkit.com, which calls itself "Blendkit (formerly BlenderKit)". The facts below come from one helper that followed that redirect. They are **leads, not verified seller-page readings**, and someone needs to confirm blendkit.com is the same company before relying on them. Lead facts: https://www.blendkit.com/plans/pricing/ lists the Full plan at $9.90/month per seat (shown at $6.63 in a −33 % promo). 82,451 models, including people and vehicles. Licence: renders "Yes, you can". Games: "Yes, if these can't be extracted by the users in an easy way". The binding T&C §5.8 (https://www.blendkit.com/terms-and-conditions-2021/) says the software must not "embed any open-format 3D model". That rules out Royalty-Free assets in our glTF web build; CC0 assets are exempt. It is good for offline props (people, cars, benches), saving about 1–2 h per building, with uneven quality.
- **Kenney City Kit (Commercial)**, https://kenney.nl/assets/city-kit-commercial: Creative Commons CC0, 50 files. Free and legally clean, but toy-stylised like Synty, so it does not fit.

---

## Recommendation

### Could not read today
KitBash3D product pages (HTTP 429); Synty City and Construction pack pages and the Synty Pass page (429); the binding Fab EULA body (rendered client-side, and per the lead behind an Epic login at legal.epicgames.com); Megascans prices and formats on Fab's seller and search pages (JS-loaded, 0 products shown; the individual listings above were read); BlenderKit (cross-host redirect, see §5); Buildify on Gumroad (JS-rendered); Superhive search (HTTP 500).

Take **Megascans on Fab**: free since 5 Nov 2026, scanned and photoreal, Blender-ready FBX/glTF. It gives the most quality per money for our offline Cycles pipeline, especially the site, construction and damaged stages, but it needs one reading of the binding Fab EULA's anti-extraction clause before any of it ships as glTF in the web game. None of the paid packs earns its price here. KitBash3D (about $948 per seat per year for a team, with an unresolved web-glTF clause) saves 3–6 h on a 25–35 h building, and Synty's low-poly style clashes outright. The bespoke civic buildings stay our own modelling work, and a facade add-on is the only paid item worth trying against the facade hours: Urban World Builder ($18–28, tested on Blender 5.2) first, or the $4 curtain-wall generator.
