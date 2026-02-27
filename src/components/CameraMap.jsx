import React, { useState, useRef, useEffect } from "react";
import {
  GoogleMap,
  Marker,
  InfoWindow,
  LoadScriptNext,
} from "@react-google-maps/api";

export default function CameraMap({ cameras }) {
  const [selected, setSelected] = useState(null);
  const mapRef = useRef(null);
  const [googleLoaded, setGoogleLoaded] = useState(false);

  function handleMapLoad(map) {
    mapRef.current = map;

    const valid = cameras.filter(
      (c) => c.lat && c.lng && !isNaN(+c.lat) && !isNaN(+c.lng)
    );
    if (valid.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    valid.forEach((c) => bounds.extend({ lat: +c.lat, lng: +c.lng }));
    map.fitBounds(bounds);
  }

  // Marker colors by payment
  const markerColor = (cam) =>
    cam.paymentStatus === "active"
      ? "rgba(0,200,0,0.9)"
      : "rgba(255,0,0,0.85)";

  // CREATE A SIMPLE CIRCLE ICON
  const createCircleIcon = (cam) => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: markerColor(cam),
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: 10,
  });

  // label reposition (OVERLAY)
  useEffect(() => {
    if (!googleLoaded) return;
    const map = mapRef.current;
    if (!map) return;

    const updateLabels = () => {
      document.querySelectorAll(".camera-label").forEach((node) => {
        const lat = Number(node.dataset.lat);
        const lng = Number(node.dataset.lng);

        const projection = map.getProjection()?.fromLatLngToPoint(
          new window.google.maps.LatLng(lat, lng)
        );
        if (!projection) return;

        const scale = Math.pow(2, map.getZoom());
        node.style.left = `${projection.x * scale}px`;
        node.style.top = `${projection.y * scale}px`;
      });
    };

    updateLabels();
    const listener = map.addListener("idle", updateLabels);

    return () => google.maps.event.removeListener(listener);
  }, [googleLoaded, cameras]);

  // no camera message
  if (!cameras?.length) {
    return (
      <div className="w-full h-[500px] bg-blue-100 rounded-xl flex items-center justify-center">
        <div className="text-center text-blue-800 font-semibold text-lg">
          No cameras added yet.
        </div>
      </div>
    );
  }

  return (
    <LoadScriptNext
      googleMapsApiKey={process.env.REACT_APP_GOOGLE_MAPS_KEY}
      onLoad={() => setGoogleLoaded(true)}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <style>
          {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 0.9 }
            50% { transform: scale(1.3); opacity: 0.3 }
            100% { transform: scale(1); opacity: 0.9 }
          }
        `}
        </style>

        <div className="w-full h-[500px] relative">
          <GoogleMap
            onLoad={handleMapLoad}
            mapContainerStyle={{ width: "100%", height: "100%" }}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
            }}
          >
            {googleLoaded &&
              cameras
                .filter(
                  (c) => c.lat && c.lng && !isNaN(+c.lat) && !isNaN(+c.lng)
                )
                .map((cam) => (
                  <React.Fragment key={cam.id}>
                    {/* LABEL (modern) */}
                    <div
                      className="camera-label"
                      data-lat={+cam.lat}
                      data-lng={+cam.lng}
                      style={{
                        position: "absolute",
                        transform: "translate(-50%, -120%)",
                        background: "rgba(0,0,0,0.75)",
                        padding: "4px 10px",
                        borderRadius: "12px",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cam.name}
                    </div>

                    {/* Marker */}
                    <Marker
                      position={{ lat: +cam.lat, lng: +cam.lng }}
                      icon={createCircleIcon(cam)}
                      onClick={() => setSelected(cam)}
                    >
                      {/* Pulsing ring */}
                    </Marker>

                    {/* pulsing overlay */}
                    <div
                      className="camera-label"
                      data-lat={+cam.lat}
                      data-lng={+cam.lng}
                      style={{
                        position: "absolute",
                        transform: "translate(-50%, -50%)",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        background: markerColor(cam),
                        opacity: 0.4,
                        animation: "pulse 1.8s infinite",
                        pointerEvents: "none",
                      }}
                    ></div>
                  </React.Fragment>
                ))}

            {/* INFO */}
            {selected && (
              <InfoWindow
                position={{ lat: +selected.lat, lng: +selected.lng }}
                onCloseClick={() => setSelected(null)}
              >
                <div className="text-sm">
                  <strong>{selected.name}</strong>
                  <div>ID: {selected.id}</div>
                  <div>
                    Status:{" "}
                    {selected.paymentStatus === "active"
                      ? "Active"
                      : "Inactive"}
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>
      </div>
    </LoadScriptNext>
  );
}
