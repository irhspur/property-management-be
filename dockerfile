# syntax=docker/dockerfile:1

# ---- Stage 1: production dependencies ---------------------------------------
# Split out from the builder so this layer's digest only changes when
# package*.json changes. `docker load` on the VPS skips layers it already has,
# so a code-only deploy writes ~400 KB to the server's disk instead of ~200 MB.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Stage 2: compile TypeScript --------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package*.json ./

# Seeding runs straight from this image (docs/DEPLOYMENT.md). These are plain
# JS + CSV, ~300 KB total, and they remove the need for a builder-stage `seed`
# service or a copy of the source tree on the VPS. `config/` is the untranspiled
# copy the seed scripts require via `../config/database`; the app itself uses
# the compiled one under dist/.
COPY seed   ./seed
COPY data   ./data
COPY config ./config

RUN mkdir -p uploads
EXPOSE 5000
CMD ["node", "dist/index.js"]
