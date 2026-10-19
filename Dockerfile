FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS pricing-api

WORKDIR /app
COPY server/pricing-api.mjs ./pricing-api.mjs
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production
ENV APITCG_CACHE_FILE=/data/apitcg-cache.json
EXPOSE 3001
USER node
CMD ["node", "pricing-api.mjs"]

FROM node:24-alpine AS progress-api

WORKDIR /app
COPY server/progress-api.mjs ./server/progress-api.mjs
COPY server/promote-admin.mjs ./server/promote-admin.mjs
COPY config/pack-sets.json ./config/pack-sets.json
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production
ENV ACCOUNT_DB_FILE=/data/account-progress.sqlite
EXPOSE 3002
USER node
CMD ["node", "server/progress-api.mjs"]

FROM nginx:alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
