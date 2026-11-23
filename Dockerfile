# syntax=docker/dockerfile:1
#
# Prompt Battle UI for local runs (docker compose in prompt-battle-kit). Production is Cloudflare Pages and
# GitHub Pages (CI), not this image.
#
# One build for every target (D-017): at start, docker-entrypoint.d/40-config.sh writes config.json from
# API_BASE_URL. Build: docker build -t prompt-battle-ui .
# Run: docker run -p 4200:80 -e API_BASE_URL=http://localhost:8080 prompt-battle-ui

FROM node:24.22.3-alpine3.24 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build \
    && rm -f dist/prompt-battle-ui/browser/config.json dist/prompt-battle-ui/browser/_headers

FROM nginx:1.30.7-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker-entrypoint.d/40-config.sh /docker-entrypoint.d/40-config.sh
COPY --from=build /src/dist/prompt-battle-ui/browser /usr/share/nginx/html
EXPOSE 80
