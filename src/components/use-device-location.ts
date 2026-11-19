"use client";

import { useState } from "react";
import type { Coords } from "./advice-request";

/** Rounds to 2 decimals (about 1 km): precise enough for air data, too coarse to pinpoint a home. */
const roundCoord = (value: number) => Math.round(value * 100) / 100;

/**
 * Reads the device position on request. Nothing is stored: the rounded coordinates live in state.
 * @returns The coordinates (once granted), a status message for screen readers, and `request`.
 */
export function useDeviceLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [message, setMessage] = useState("");

  function request() {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location. Enter a city or ZIP code instead.");
      return;
    }
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords: position }) => {
        setCoords({
          latitude: roundCoord(position.latitude),
          longitude: roundCoord(position.longitude),
        });
        setMessage("Using your device location. It is not stored.");
      },
      () => setMessage("We could not get your location. Enter a city or ZIP code instead."),
    );
  }

  return { coords, message, request };
}
