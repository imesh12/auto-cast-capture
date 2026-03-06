FROM node:20-bookworm-slim

# Install ffmpeg
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server ./server
COPY public ./public

# make sure runtime dirs exist
RUN mkdir -p /app/server/hls /app/server/captures

ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server/server.js"]