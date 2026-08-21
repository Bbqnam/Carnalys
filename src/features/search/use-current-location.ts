"use client";

import { useState } from "react";

export type LocationStatus = "idle" | "locating" | "ready" | "unavailable";
export interface UserLocation {
  latitude: number;
  longitude: number;
}

export function useCurrentLocation() {
  const [location, setLocation] = useState<UserLocation>();
  const [status, setStatus] = useState<LocationStatus>("idle");

  function requestCurrentLocation() {
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
      () => setStatus("unavailable"),
    );
  }

  return { location, status, requestCurrentLocation };
}
