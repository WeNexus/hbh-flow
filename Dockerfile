FROM node:24.9-alpine AS build

RUN apk add --no-cache \
    build-base \
    g++ \
    make \
    jpeg-dev \
    cairo-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    freetype-dev \
    pixman-dev \
    libtool \
    autoconf \
    automake \
    pkgconf

RUN corepack enable pnpm

WORKDIR /app

# --- Backend dependencies ---
# Copy only the files that affect dependency resolution first, so this layer
# (and the expensive install below) is cached and reused whenever only source
# code changes. It's re-run only when the lockfile/manifests/patches change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY pnpm/patches ./pnpm/patches
RUN pnpm install --frozen-lockfile --prefer-offline --prod

# --- UI dependencies ---
# Same idea for the UI workspace, which installs independently (--ignore-workspace).
COPY apps/ui/package.json apps/ui/pnpm-lock.yaml ./apps/ui/
WORKDIR /app/apps/ui
RUN pnpm install --prefer-offline --ignore-workspace

# --- Source ---
# node_modules is excluded via .dockerignore, so this does not clobber the
# dependencies installed above.
WORKDIR /app
COPY . .

RUN pnpm prisma generate
RUN pnpm prune --prod

WORKDIR /app/apps/ui
RUN pnpm build:skiptsc

WORKDIR /app
RUN rm -rf ./apps/ui
RUN pnpm store prune

FROM node:24-alpine AS production

RUN apk add --no-cache \
    jpeg-dev \
    cairo-dev \
    pango-dev \
    freetype-dev \
    pixman-dev \
    librsvg-dev \
    giflib-dev

RUN corepack enable pnpm

WORKDIR /app

COPY --from=build /app .

EXPOSE 3001

CMD ["pnpm", "start", "--prod"]
