# Saldo frontend — nginx serving the static bundle.
#
# Stage 0: copies the placeholder index.html directly. Stage 6 adds a Node build
# stage (`npm run build`) that produces the real Vite bundle before this nginx
# stage serves it.
FROM nginx:1.27-alpine

# Replace the default site config with ours (SPA fallback + /api proxy).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the static content. Stage 6 will swap this for `--from=build /app/dist`.
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
