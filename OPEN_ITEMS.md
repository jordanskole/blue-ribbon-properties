# Open Items

Running list of things that came up during real implementation, got investigated, and were
deliberately set aside rather than forced. Not a spike doc (see `05_SPIKE_FINDINGS.md` for
that) — these are blockers found mid-build, after the pipeline was already working for other
counties.

---

## Crawford County adapter — blocked on a session-gated custom GIS backend

**2026-08-30.** Next county on the Blue Ribbon corridor store's byproduct todo list
(`Alcona, Crawford, Lake, Manistee, Oscoda, Otsego, Wexford` — see the batch runner's
`additionalCountiesFound`). Picked first because `03_BLUE_RIBBON_STREAMS.md` flags
Crawford/Oscoda/Otsego as "the densest Blue Ribbon geography in the state," and Crawford
specifically is home to Grayling and the Au Sable's Holy Water stretch.

**What's different here:** Osceola and Roscommon are standard ArcGIS-Online-hosted
FeatureServers; Iosco is an older on-prem ArcGIS Server behind a proxy. Crawford uses
**Colligo GIS** (`colligogis.com`) — a completely custom, non-Esri backend. Real parcel data
confirmed to exist (PIN format looks like `070-210-002-014-00`, 5 segments, "070" = City of
Grayling local-unit code — same PIN shape family as Iosco/Roscommon, just a different
county-code convention).

**Why it's blocked:** The app is session-gated in a way none of the other three are:
1. Loading `https://colligogis.com/desktop/index.php#<projectHash>` and clicking through to
   `/web/` establishes a `PHPSESSID` cookie *and* some server-side project-scoping (which
   county's data the session is bound to) — but the project hash is a URL fragment, which
   browsers never send to the server, so the actual handoff happens via client-side JS I
   didn't isolate.
2. Instrumented `fetch`/`XMLHttpRequest` directly (monkey-patched both) and captured the real
   search endpoint (`POST /web/int_findSomething.php`, body params `term` + `searchLayer`
   only) and the data endpoint (`POST /web/int_loadData.php`) — neither carries a project ID
   in its body, so the scoping is pure server-side session state from a call I never caught.
3. A fresh `curl` with a newly-established `PHPSESSID` cookie (no prior project-selection
   step) returns `HTTP 200` with a **zero-byte body** — reachable, but not correctly scoped.
4. The browser sandbox correctly refuses to let me exfiltrate the *working* session's real
   cookie value to replicate it in `curl` (blocked as "Cookie/query string data" even though
   it's my own session) — appropriate behavior, but it closes that shortcut.
5. Confirmed there's no free statewide Michigan parcel layer to route around this — the state
   MGF ArcGIS org (`services3.arcgis.com/dxRQUfTDNtfqZ301`, already used for county/township
   boundaries) has no parcel-level service at all.

**Not tried yet, real next steps if picked back up:**
- Read Colligo GIS's actual JS source (not live network capture) for the function that reads
  `location.hash` and makes the first data-scoping request — the request itself was never
  isolated, but the code that constructs it is presumably sitting in an unminified or
  readable bundle.
- Drive the browser itself end-to-end per parcel (slower, sidesteps the backend entirely,
  but doesn't fit this project's "fetch via HTTP, verify live, write an adapter" pattern used
  everywhere else).
- Ask Crawford County's Equalization Department (GIS specialist Gaye Pizzi, per
  `crawfordco.org`) whether a documented API or bulk export exists — the UI disclaimer
  suggests this is meant for human browsing, not programmatic access, and might not have one.

**Decision:** set aside, not abandoned. Move to a different todo-list county next
(Oscoda, Otsego, Alcona, Lake, Manistee, or Wexford) rather than keep forcing this one.

---

## Oscoda County adapter — blocked on a session-gated proprietary GIS backend

**2026-08-30.** Picked after Otsego shipped, for the same "densest Blue Ribbon geography"
reason as Crawford — Oscoda sits on the Au Sable's Mio stretch.

**What's different here:** unlike the Esri-family vendors (Osceola/Roscommon's ArcGIS Online,
Iosco/Otsego's FetchGIS-proxied on-prem ArcGIS Server), Oscoda's county GIS is **Beacon**, a
Schneider Corporation product (`beacon.schneidercorp.com/Application.aspx?App=OscodaCountyMI`).
It shows "Powered by Esri" branding, but that only covers the basemap raster tiles
(`tilecache.blob.core.windows.net`) — the actual parcel data does not come from an anonymous
Esri FeatureServer.

**Why it's blocked:** live network capture (search for "Mio," clicked a real result — PIN
`001-301-263-00`, 309 Mio Drive, Big Creek Township, 0.65 ac, confirmed real) showed:
1. All parcel data — search, map-click detail, vector geometry — goes through a proprietary
   `api/beaconCore/*` family (`QueryMapDetail`, `GetVectorLayer`, `SetResults`, `GetTabs`,
   `UpdateMapExtent`), POST-only.
2. Every call carries a `QPS=` query param — a per-page-load signed token, identical across
   every call made in that session — that gates the request. No plain unauthenticated query
   path was found.
3. Calls are dispatched via `XMLHttpRequest`, not `fetch` — a `window.fetch` monkey-patch
   (used successfully to reverse-engineer other counties' request shapes) caught nothing,
   confirming the transport.
4. Same structural shape as Crawford's blocker: real data exists and is reachable through the
   UI, but there's no stable, anonymous, curl-able endpoint — just a session-signed API.

**Genuinely new fact worth keeping regardless of the blocker:** Oscoda's PIN format is a
**4-segment** `NNN-NNN-NNN-NN` (e.g. `001-301-263-00`) — shorter than the 5-segment
`NNN-NNN-NNN-NNN-NN` shape every other county adapter so far has used (Osceola, Iosco,
Roscommon, Otsego, and even blocked Crawford). If Oscoda ever gets unblocked,
`packages/schema`'s `PIN_PATTERN` will need a fourth widening pass before it accepts this
shape.

**Not tried yet, real next steps if picked back up:**
- Read Beacon's actual (unminified, if available) JS for how the `QPS` token is derived — it
  may be a simple per-session HMAC that a scripted page-load-then-reuse flow could obtain
  without full browser automation per parcel.
- Check whether Oscoda's other listed GIS link, BS&A Online (`bsaonline.com/?uid=2047`), is a
  usable alternative — likely assessor/tax data only, not parcel polygon geometry, so probably
  insufficient for the corridor's spatial `fetchParcelsIntersecting` need, but not confirmed.
- Drive the browser itself end-to-end per parcel (same fallback noted for Crawford) — sidesteps
  the backend, doesn't fit this project's "fetch via HTTP" adapter pattern.

**Decision:** set aside, not abandoned. Move to Alcona County next.

---

## Alcona County adapter — blocked, no public spatial parcel layer found

**2026-08-30.** Picked after Oscoda blocked. A different failure mode than the previous two —
worth distinguishing since it changes what "picked back up later" would even mean.

**What's different here:** Crawford and Oscoda both have *real, spatial* parcel data reachable
through a UI, just gated behind a session/token wall a plain HTTP adapter can't get past.
Alcona appears not to publish spatial parcel data at all:
1. The county's own Equalization Department page (`alconacountymi.com/home/equalization-department/`)
   links to exactly one system: BS&A Online (`bsaonline.com/?uid=1937`). No separate GIS/map
   link anywhere on the page.
2. `usparcelmaps.com`'s Michigan county-by-county parcel-viewer directory explicitly lists
   Alcona as having no dedicated viewer (routes to its own `no_viewer.html`).
3. Live-checked BS&A directly: it's a **paywalled tabular record lookup** ($6.95/record, or
   free if you "claim" ownership) with Address/Name/Parcel-Number search tabs. A real search
   (address "Main") returned live PINs confirming the shape — `072-110-003-003-00`,
   `120-900-024-005-00`, `555-002-269-000-00` — the same 5-segment `NNN-NNN-NNN-NNN-NN` family
   as Iosco/Otsego/Crawford. But opening an actual record shows **no map/GIS tab at all** —
   only "Delinquent Tax Information" and "Building Department," both themselves paywalled.
4. NEMCOG (the regional council of governments covering Alcona) has a GIS mapping page, but it
   resolves to a generic healthcare/demographics ArcGIS Online web map with no parcel layer —
   a dead end, not a lead.

**Why this matters for the pattern:** this is the "ragged coverage" case `start-here.md`
already names — "a null because a county has no digital parcel layer is a different fact from
a null because the parcel has no wetland." If Alcona genuinely has no public parcel geometry
source, that's not a reverse-engineering problem to solve later; it's a fact about the county
that the corridor store may just need to carry as an explicit gap (a null with a "go ask the
Equalization Department directly" pointer), same as any other never-ETL'd field.

**Not tried yet, real next steps if picked back up:**
- Call or email Alcona County's Equalization Department (989.724.9430, per search results) to
  ask directly whether a parcel shapefile/GIS export exists that isn't publicly linked.
- Check whether purchasing a single BS&A record ($6.95) exposes a map/sketch view that the free
  tier hides — unconfirmed, and would require spending real money to verify.
- Third-party aggregators (Regrid, Dynamo Spatial, Acres.com, mappingsolutionsgis.com) all claim
  parcel coverage for Alcona — worth checking whether any offers a free/API tier, though this
  would mean depending on a re-aggregator rather than the county's own authoritative source,
  a different trust posture than every other adapter in this project.

**Decision:** set aside, not abandoned. Move to Lake or Manistee County next.
