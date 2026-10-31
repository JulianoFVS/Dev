FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WHATSAPP_DATA_DIR=/data/sessao

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./

# A sessão do WhatsApp fica em /data; monte um volume aí para não precisar de QR a cada deploy.
VOLUME ["/data"]
CMD ["node", "server.mjs"]
