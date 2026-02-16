# APIs and Data (No Mock Data)

All external APIs and the data fetched from them. Repositories and clients use these for real data only.

---

## 1. FuelSense UAT (Primary Backend)

**Base URL:** `process.env.NEXT_PUBLIC_FUELSENSE_API_URL` or `process.env.BUNKER_PRICING_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com` (with or without `/api` depending on client).

### 1.1 Bunker / BunkerDataService

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/api/bunker-pricing?ports=...&fuelTypes=...&startDate=...&endDate=...` | GET | **BunkerPricing[]**: port, fuelType, pricePerMT, currency, lastUpdated, supplier?, availableQuantity? |
| `/api/ports/:portCode/capabilities` | GET | **PortCapabilities**: portCode, availableFuelTypes[], maxSupplyRate?, berthAvailability?, ecaZone |
| `/api/vessels/:vesselId/specs` | GET | **VesselSpecs**: vesselId, vesselName, vesselType, consumptionRate, tankCapacity, currentPosition?, fuelCompatibility[] |
| `/api/vessels/:vesselId/rob` | GET | **ROBSnapshot**: vesselId, timestamp, robVLSFO?, robLSMGO?, robMGO?, totalROB, location? |
| `/api/fleet/status?availableAfter=...&currentRegion=...&vesselTypes=...&minCapacity=...` | GET | **VesselStatus[]**: vesselId, vesselName, currentVoyage?, eta?, nextAvailable?, currentPosition?, currentROB? |
| `/api/bunker-pricing/history?port=...&fuelType=...&lookbackDays=...` | GET | **PriceHistory[]**: date, price, port, fuelType |

### 1.2 BunkerPricingClient (Bunker Pricing API)

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/api/bunker-pricing?filter=...&sort=...&limit=...` | GET | **BunkerPricingRow[]** (port, fuel_type/fuelType, price_usd_per_mt/priceUsdPerMt, date/last_updated, region) → mapped to **BunkerPriceMapped** (portCode, portName, fuelType, priceUSD, date, updatedAt) |

Used by **PriceRepository** for `getLatestPrices` when port name is provided (API keyed by port name).

### 1.3 World Port Index (WorldPortIndexClient)

**Base URL:** `process.env.NEXT_PUBLIC_WORLD_PORT_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/world-port-index?filter=unLocode\|\|$cont\|\|CODE&limit=1` | GET | **WorldPortIndexPort[]** (id, OID, unLocode, mainPortName, alternatePortName, countryCode, latitude, longitude, harborSize, facilitiesOilTerminal, etc.) → **WorldPortEntry** (id, code, name, coordinates, countryCode, harborSize) |
| `/world-port-index?filter=mainPortName\|\|$contL\|\|...` (and variants) | GET | Same shape; used for **searchByName** |

Used by **WorldPortRepositoryAPI** → **PortRepository** for `findByCode` and `findByName`.

### 1.4 Vessel Details (VesselDetailsClient)

**Base URL:** `VESSEL_MASTER_API_URL` or `NEXT_PUBLIC_FUELSENSE_API_URL` or `NOON_REPORT_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/vessel-details?limit=N` | GET | **VesselDetailRow[]** (imo, vesselName, vesselType, builtDate, deadweight, flag, etc.) → **VesselBasicInfo** |
| `/vessel-details?filter=imo\|\|$eq\|\|IMO&limit=1` | GET | Single vessel by IMO |
| `/vessel-details?filter=vesselName\|\|$contL\|\|NAME&limit=1` | GET | Single vessel by name |

### 1.5 Datalogs / Noon Reports (DatalogsClient)

**Base URL:** `NOON_REPORT_API_URL` or `NEXT_PUBLIC_FUELSENSE_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/datalogs?filter=VESSEL_IMO\|\|$eq\|\|IMO&limit=1&sort=REPORT_DATE,DESC` | GET | **DatalogRow[]** (VESSEL_IMO, VESSEL_NAME, REPORT_DATE, LATITUDE, LONGITUDE, ROB_VLSFO, ROB_LSMGO, etc.) → **NoonReportData** |
| `/datalogs?filter=VESSEL_NAME\|\|$contL\|\|NAME&limit=1&sort=REPORT_DATE,DESC` | GET | Same by vessel name |

### 1.6 Hull Performance (HullPerformanceClient)

**Base URL:** `HULL_PERFORMANCE_API_URL` or `NEXT_PUBLIC_FUELSENSE_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/hull-performance?vessel_imo=...&vessel_name=...&start_date=...&end_date=...&limit=...&offset=...` | GET | **HullPerformanceRecord[]** (hull condition, metrics, trends) |
| `/vessel-performance-model-table?vessel_imo=...&load_type=...` | GET | **VesselPerformanceModelRecord[]** (baseline curves by load type) |

Used by **HullPerformanceRepository** (with Redis cache).

### 1.7 Vessel Performance Model (VesselPerformanceModelClient)

**Base URL:** `BASELINE_PROFILE_API_URL` or `VESSEL_MASTER_API_URL` or `NOON_REPORT_API_URL` or `https://uat.fuelsense-api.dexpertsystems.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/vessel-performance-model-table?filter=vesselImo\|\|$eq\|\|IMO&limit=50` | GET | Vessel performance model table rows (consumption baseline by vessel IMO) |

---

## 2. Maritime Route API (External)

**Base URL:** `https://maritime-route-api.onrender.com`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/ports` | GET | List of ports (name, lat, lon or similar) for port resolution |
| `/route?from=...&to=...&speed=...` or `origin_lat/origin_lon/dest_lat/dest_lat` | GET | **Route**: distance (nm), geometry [lon,lat][], duration; optional resolved origin/destination |

Used by **SeaRouteAPIClient** (route calculation), **port-resolver.ts** and **sea-route-ports.ts** (port list).

---

## 3. Open-Meteo Marine API (External)

**Base URL:** `https://marine-api.open-meteo.com/v1/marine`

| Endpoint | Method | Data Fetched |
|----------|--------|--------------|
| `/?latitude=...&longitude=...&hourly=wave_height,wind_speed_10m,wind_direction_10m&forecast_days=16&timezone=UTC` | GET | Marine weather: waveHeight, windSpeed (knots), windDirection (degrees), seaState |

Used by **OpenMeteoAPIClient** for marine weather.

---

## 4. Repositories and Their Data Sources (Real Data Only)

| Repository | Data source (no mocks) |
|------------|------------------------|
| **PortRepository** | WorldPortRepositoryAPI → World Port Index API (findByCode, findByName). findBunkerPorts / findNearby return [] (not implemented with API). |
| **WorldPortRepositoryAPI** | WorldPortIndexClient (World Port Index API) + RedisCache. |
| **PriceRepository** | RedisCache → BunkerPricingClient (Bunker Pricing API); optional Supabase/fallback. |
| **VesselRepository** | JSON file (`lib/data/vessels.json`) and/or Supabase; no FuelSense vessel API in repo (vessel-service may use other sources). |
| **HullPerformanceRepository** | RedisCache → HullPerformanceClient (Hull Performance API). |
| **BunkerDataService** | Direct HTTP to FuelSense `/api` (bunker-pricing, ports/:id/capabilities, vessels/:id/specs, vessels/:id/rob, fleet/status, bunker-pricing/history). On failure, returns in-memory mock data (see code). |

---

## 5. Environment Variables (API Base URLs)

| Variable | Used by | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_FUELSENSE_API_URL` | BunkerDataService, BunkerPricingClient, WorldPortIndex, VesselDetails, Datalogs, HullPerformance, VesselPerformanceModel | `https://uat.fuelsense-api.dexpertsystems.com` (or `/api`) |
| `BUNKER_PRICING_API_URL` | BunkerDataService, BunkerPricingClient | same |
| `NEXT_PUBLIC_WORLD_PORT_API_URL` | WorldPortIndexClient | same (no `/api`) |
| `VESSEL_MASTER_API_URL` | VesselDetailsClient, scripts | same |
| `NOON_REPORT_API_URL` | DatalogsClient, VesselDetailsClient, scripts | same |
| `HULL_PERFORMANCE_API_URL` | HullPerformanceClient | same |
| `BASELINE_PROFILE_API_URL` | VesselPerformanceModelClient, scripts | same |
| `HULL_PERFORMANCE_API_KEY` | HullPerformanceClient (optional Bearer token) | - |

---

*No mock data: all table data above is what the application fetches from live APIs or from Redis/DB/JSON when configured.*
