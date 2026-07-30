function encodeLocation(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

export function googleMapsPlaceUrl(
  lat: number,
  lng: number,
  _label?: string,
): string {
  const params = new URLSearchParams({
    api: '1',
    query: encodeLocation(lat, lng),
  });

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function googleMapsMultiStopUrl(
  stops: Array<{ lat: number; lng: number; label?: string }>,
): string {
  if (stops.length === 0) {
    return 'https://www.google.com/maps/dir/?api=1';
  }

  const [destination, ...waypoints] = stops;
  const params = new URLSearchParams({
    api: '1',
    destination: encodeLocation(destination.lat, destination.lng),
  });

  if (waypoints.length > 0) {
    params.set(
      'waypoints',
      waypoints
        .map((stop) => encodeLocation(stop.lat, stop.lng))
        .join('|'),
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
