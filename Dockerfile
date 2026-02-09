FROM node:20-alpine AS builder

WORKDIR /app

# Kopiowanie plików package
COPY package*.json ./

# Instalacja wszystkich zależności
# Wymuszamy NODE_ENV=development, żeby npm ci na pewno zainstalował devDependencies (Nest CLI)
ENV NODE_ENV=development
RUN npm ci

# Kopiowanie kodu źródłowego
COPY . .

# Build aplikacji
RUN npm run build

# === PRODUCTION STAGE ===
FROM node:20-alpine AS production

WORKDIR /app

# Kopiowanie plików package
COPY package*.json ./

# Instalacja tylko production dependencies oraz curl dla healthchecku
RUN apk add --no-cache curl && npm ci --only=production

# Kopiowanie zbudowanej aplikacji
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start aplikacji
CMD ["node", "dist/main"]
