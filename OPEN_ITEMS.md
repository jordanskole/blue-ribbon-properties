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
