# auto-cast-capture

Town Capture / Auto Cast Capture system.

This repository contains:
- **Client (React / CRA)**: Admin UI (dashboard, cameras, QR, settings)
- **API Server (Node.js + Express)**: Stripe webhook + Firebase Admin + capture + HLS hosting
- **Web (React / CRA)**: Separate small web app (optional)

---

## Contents
- [Features](#features)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Stripe Webhook Setup](#stripe-webhook-setup)
- [Stripe Payment Flows (B2C + B2B)](#stripe-payment-flows-b2c--b2b)
- [Architecture](#architecture)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## Features

### Capture / Streaming
- HLS streaming endpoint (served by the API server under `/hls`)
- HLS headers set for `.m3u8` and `.ts` content types
- LAN-safe CORS configuration for local development

### Stripe
- **B2C**: one-time capture payment (supports async payments like PayPay)
- **B2B**: camera subscription checkout + activation + invoice sync
- **Webhook idempotency** using Firestore: `stripeEvents/{eventId}`

### Secure download
- Paid downloads use `downloadTokens/{token}`
- Token expires in **1 hour**, max **3 downloads**
- Anti-prefetch safe download:
  - `GET /stripe/dl/:token` creates HttpOnly cookie nonce
  - `POST /stripe/dl/:token/go` verifies cookie nonce + consumes download count
  - Redirects to a **short signed URL (5 min)** from Firebase Storage

### Storage cleanup
- Background cleanup deletes expired captures to reduce storage costs
- Uses `deleteAfter` timestamp in `captureSessions`

---

## Project Structure

.
├── README.md
├── package.json # root client (React)
├── src/ # root client source
├── public/ # static pages (capture UI etc.)
├── server/ # API server (Express)
│ ├── server.js
│ ├── stripeRoutes.js
│ └── serviceAccountKey.json (NOT committed)
└── web/ # optional second React app


---

## Quick Start

### 1) Install dependencies

```bash
# root client
npm install

# server
cd server
npm install
cd ..

# web app (optional)
cd web
npm install
cd ..