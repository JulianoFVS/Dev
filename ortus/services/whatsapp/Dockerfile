FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Fora do contêiner o serviço escuta só em 127.0.0.1. Aqui dentro ele precisa
# escutar em 0.0.0.0, senão a porta publicada não chega nele, e isso pede as
# duas variáveis de exposição (veja docs/WHATSAPP.md). Quem decide o alcance é
# a publicação da porta: na mesma máquina do site, use `-p 127.0.0.1:3920:3920`.
# Nunca publique esta porta na internet sem TLS na frente.
# A porta é WHATSAPP_GATEWAY_PORT; sem ela vale PORT (Railway, Render) e, por fim, 3920.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WHATSAPP_DATA_DIR=/data/sessao \
    WHATSAPP_GATEWAY_HOST=0.0.0.0 \
    WHATSAPP_GATEWAY_EXPOSE=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
COPY lib ./lib

# A sessão do WhatsApp fica em /data; monte um volume aí para não precisar de QR a cada deploy.
VOLUME ["/data"]
EXPOSE 3920
CMD ["node", "server.mjs"]
