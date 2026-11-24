# GPS tracking: how it works and its limits

## Pipeline
1. The driver PWA (`frontend/src/hooks/useGeolocationTracker.ts`) asks for geolocation permission **only after the driver starts a trip** and turns on sharing. It uses `watchPosition` with high accuracy and posts a sample to `POST /api/driver/trips/<id>/location/` every `DRIVER_LOCATION_INTERVAL_SECONDS` (default 10 s).
2. The backend (`apps/trips/services.py::record_location`) validates every sample: coordinates in range, accuracy ≤ `GPS_MAX_ACCURACY_METERS`, timestamp not in the future and not older than `GPS_MAX_AGE_SECONDS`, monotonic order per trip, only while the trip is `IN_PROGRESS` and only from the trip's assigned driver/attendant. Accepted samples are appended to `GPSLocation` (history) and upserted into `VehicleLocation` (current position, one row per vehicle).
3. A Celery task (`process_location_update`) projects the position onto the route polyline, computes the remaining distance and ETA for every pending stop (`apps/trips/eta.py`), auto-marks stop arrival within 60 m, triggers the arrival/delay/ETA-change notifications, and broadcasts the update over Channels to `ws/trips/<id>/` (parents, staff) and `ws/schools/<id>/live/` (admin map).
4. `detect_stale_trips` (beat, every minute) flags trips whose last sample is older than the school's `gps_stale_seconds` and notifies staff after 10 minutes of silence. Clients show a clear **stale / connection lost** state using `last_location_at`.

## ETA
Straight-line polyline between ordered stops (or a detailed `Route.path`), average of recent GPS speeds (fallback `ETA_DEFAULT_SPEED_KMH`), plus stop dwell time. No external routing API is required. For production-grade ETAs swap `apps/trips/eta.py::estimate` for OSRM / Google Routes / Mapbox Directions; the notification logic is independent of the estimator.

## Known limitations of browser (PWA) tracking
- **Background execution is not guaranteed.** iOS Safari and most Android browsers suspend timers and geolocation when the tab is in the background, the screen locks or another app is in front. Tracking is reliable only while the driver app is in the foreground. The driver UI says so explicitly and shows "last sent" time.
- **Secure context required.** `navigator.geolocation` and service workers require HTTPS (or `localhost`). Deploy behind TLS.
- **Accuracy varies**: samples worse than 250 m are dropped (configurable).
- **Battery / data**: 10 s interval is a compromise; make it configurable per school via `gps_stale_seconds`.

## Production options
1. **Native app wrapper** (Capacitor / React Native) using background-location plugins with the same `POST /api/driver/trips/<id>/location/` contract.
2. **Dedicated GPS tracker** in the bus: implement a small ingestion endpoint that authenticates the device (`Vehicle.gps_device_id` + per-device token), maps the device to the vehicle's active trip, and calls `record_location(source="DEVICE")`. Everything downstream (ETA, alerts, websockets) is reused.
3. **Demo simulator** (`apps/demo/simulator.py`) feeds the same pipeline with `is_simulated=True`; it is only available when `DEMO_MODE=True` and every UI surface labels simulated data.
