function encodeLocation(lat: number, lng: number, label?: string): string {
  const base = `${lat},${lng}`;
  return label ? `${base} (${label})` : base;
}

export function googleMapsPlaceUrl(
  lat: number,
  lng: number,
  label?: string,
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: encodeLocation(lat, lng, label),
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
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
    destination: encodeLocation(destination.lat, destination.lng, destination.label),
  });

  if (waypoints.length > 0) {
    params.set(
      'waypoints',
      waypoints
        .map((stop) => encodeLocation(stop.lat, stop.lng, stop.label))
        .join('|'),
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
