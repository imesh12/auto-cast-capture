import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// IMPORTANT: No StrictMode (prevents double-mount issues with maps/qr/hls libs)
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found. Check public/index.html has <div id='root'></div>.");
}

ReactDOM.createRoot(rootEl).render(<App />);