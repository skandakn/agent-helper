FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

# Bind to 0.0.0.0 so the container port mapping (3000:3000) actually reaches the dev server.
CMD ["pnpm", "dev", "-p", "3000", "-H", "0.0.0.0"]
