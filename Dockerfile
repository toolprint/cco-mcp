# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files for both root and UI
COPY package.json pnpm-lock.yaml ./
COPY ui/package.json ui/pnpm-lock.yaml ./ui/

# Install all dependencies (including UI)
RUN pnpm install --frozen-lockfile
RUN cd ui && pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build UI first, then the application (which will copy UI files)
RUN pnpm run build:ui
RUN pnpm run build

# Runtime stage
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Cloud Run will set PORT env variable, default to 8080
EXPOSE 8080

# Run the application
CMD ["node", "dist/index.js"]