FROM node:24-alpine AS build

RUN corepack enable pnpm

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile --prefer-offline --prod
RUN pnpm prisma generate
RUN pnpm prune --prod

WORKDIR /app/apps/ui

RUN pnpm install --frozen-lockfile --prefer-offline --ignore-workspace
RUN pnpm build:skiptsc

WORKDIR /app
RUN rm -rf ./apps/ui
RUN pnpm store prune

FROM node:24-alpine AS production

RUN corepack enable pnpm

WORKDIR /app

COPY --from=build /app .

EXPOSE 3001

CMD ["pnpm", "start", "--prod"]



