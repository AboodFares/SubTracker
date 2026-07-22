# ── Frontend image: multi-stage (build with Node, serve with nginx) ────
#
# Multi-stage keeps the final image tiny: the big Node toolchain is only in
# the "build" stage and is thrown away. The image we actually ship is just
# nginx + the static files it produced.

# ── Stage 1: build the React app into static HTML/CSS/JS ──
FROM node:22-slim AS build
WORKDIR /app

# Install deps first (cached layer — see the backend Dockerfile note)
COPY package*.json ./
RUN npm ci

# Vite bakes environment variables into the bundle AT BUILD TIME. This ARG
# lets docker-compose pass the backend URL the browser should call. Default
# matches local dev (the backend published on localhost:3000).
ARG VITE_API_URL=http://localhost:3000/api
ENV VITE_API_URL=$VITE_API_URL

# Copy the source and produce the optimized bundle in /app/dist
COPY . .
RUN npm run build

# ── Stage 2: serve those static files with nginx ──
FROM nginx:alpine

# Replace nginx's default site with our SPA config (handles client-side routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy ONLY the built output from stage 1 — no Node, no source, no node_modules
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Run nginx in the foreground (daemon off) so the container stays alive
CMD ["nginx", "-g", "daemon off;"]
