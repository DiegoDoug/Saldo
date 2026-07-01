# Saldo frontend — build the Vite bundle, then serve it with nginx.
#
# The default API base URL (/api) is proxied to the backend by nginx.conf, so
# the browser only ever talks to one origin (which also keeps things simple
# behind Cloudflare Tunnel).

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
