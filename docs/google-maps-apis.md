# Google Cloud APIs for Gay-i (in-app maps)

Gay-i keeps maps, places, and travel times **inside the app**. Enable these APIs on the Google Cloud project tied to your key:

## Required

1. **Maps SDK for iOS** — in-app MapView  
2. **Maps SDK for Android** — Android builds  
3. **Geocoding API** — lodging address → lat/lng  
4. **Places API** — nearby highly rated spots + Place Photos  
5. **Distance Matrix API** — walk / transit / drive times between itinerary stops  

## Env wiring

Keys live in the **repo-root** `.env`. `apps/mobile/app.config.js` loads that file and injects:

- `extra.googleMapsApiKey` / `extra.googlePlacesApiKey`
- iOS `config.googleMapsApiKey`
- Android `config.googleMaps.apiKey`

After changing keys:

```bash
cd apps/mobile && npx expo start --go --clear
```

Confirm Metro prints `[gayi] API keys loaded — maps:true places:true …`.

## Key restrictions (iOS)

Application restrictions → **iOS apps**, add:

- `host.exp.Exponent` (Expo Go testing)  
- `com.gayi.app` (Gay-i builds)

API restrictions → enable only the five APIs above.

## Not required for primary UX

- Maps JavaScript API (web)  
- Directions API (we compute legs via Distance Matrix and draw a simple polyline)  
- Sending users out to the Google Maps app (optional secondary only)
