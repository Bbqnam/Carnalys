"use client";

import { useState } from "react";

export type LocationStatus =
  | "idle"
  | "locating"
  | "ready"
  /** The browser or OS refused the request — the user has to change a setting. */
  | "denied"
  /** Position couldn't be determined (no fix, timed out, or no geolocation API). */
  | "unavailable";

export interface UserLocation {
  latitude: number;
  longitude: number;
}

// iOS in particular is slow to produce a first fix — the default timeout of
// Infinity leaves the button stuck on "Finding you…" forever, while too short
// a timeout reports failure while a fix is still coming. 20s is long enough
// for a cold coarse fix on cellular. Accepting a cached position up to 10
// minutes old makes the common case instant, and low accuracy is plenty for
// "how far is this car from me" (it avoids waiting on GPS entirely).
const positionOptions: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 600_000,
};

export function useCurrentLocation() {
  const [location, setLocation] = useState<UserLocation>();
  const [status, setStatus] = useState<LocationStatus>("idle");

  function requestCurrentLocation() {
    if (status === "ready") {
      setLocation(undefined);
      setStatus("idle");
      return;
    }

    // Geolocation is only exposed in a secure context, so over plain HTTP on
    // anything but localhost (e.g. hitting a dev server by LAN IP from a
    // phone or tablet) `navigator.geolocation` is missing entirely.
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setStatus("ready");
      },
      (error) => {
        // Previously every failure collapsed into one generic "unavailable",
        // which gave no clue whether the user had blocked location (fixable
        // in settings) or the device simply couldn't get a fix (retryable).
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      positionOptions,
    );
  }

  return { location, status, requestCurrentLocation };
}
