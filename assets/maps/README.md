# LYANN basemap

`lyann-liberty.json` is a local palette adaptation of OpenFreeMap Liberty, retrieved
2026-10-22 from https://tiles.openfreemap.org/styles/liberty. Geometry, source
layers, road widths, labels and zoom rules remain those of the original style.
The LYANN palette keeps real geographic vector features: roads, buildings, parks,
water and labels. The optional Natural Earth raster overview layer has been
removed, so **all map geometry sources are vector** at every zoom level.
MapLibre draws vector geometry from OpenFreeMap/OpenMapTiles PBF tiles, not
static PNG street-map images. Style sprites for small point-of-interest icons
may still be image assets; they do not replace map geometry.
Paint colors and label halos are customized; geographic detail remains real.
This is not a decorative map.

Sources and terms:
- https://openfreemap.org/quick_start/
- https://openfreemap.org/ (public instance, commercial use, no API key)
- https://github.com/hyperknot/openfreemap-styles
- https://github.com/maputnik/osm-liberty

Keep the included license notices and visible OpenMapTiles/OpenStreetMap credits.
Tiles, sprites and fonts come from OpenFreeMap; no OSM community raster endpoint,
bulk download, prefetch or offline tile cache is used. Normal HTTP caching applies.
The public service has no contractual availability guarantee: the map reports
failures and offers Retry. Provider requests disclose IP and viewed tile area,
but never send post content, user IDs or device GPS. No GPS permission is requested.

An operator may set `window.LYANN_MAP_STYLE_URL` **before** `bokantaj-map.js` to
an HTTPS MapLibre Style JSON URL for a licensed provider/self-hosted service.
The override is used unchanged (no palette assumptions). Its vector sources must
provide their attribution, use HTTPS and permit Web/WKWebView origins. Credentials
in a client style URL are public: use only provider-issued restricted public tokens,
never server secrets. No URL is accepted from user input or query parameters.
The checked-in default has no key and works for both Web and Capacitor.

Leaflet 1.9.4 owns interaction and pins; MapLibre GL 5.6.1 with the 0.1.4 Leaflet
adapter draws the vector basemap. All three are pinned and copied from npm into
`vendor/` by the existing shared build preparation step (licenses included).
Do not edit generated iOS assets separately.
