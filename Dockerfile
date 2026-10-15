# One image for the whole dashboard: the frontend is built here and then
# served by the Express backend, so it runs as a single container.

FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend /app/dist ./public
EXPOSE 3001
USER node
CMD ["node", "server.js"]
