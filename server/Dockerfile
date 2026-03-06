# ---- Base
FROM node:20-bookworm-slim



# ---- Install ffmpeg
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- App
WORKDIR /app

# Install deps first (better cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app code
COPY . .

# Cloud Run uses PORT=8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]