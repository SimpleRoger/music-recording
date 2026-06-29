FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm@11

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

CMD ["pnpm", "--filter", "@workspace/db", "run", "push-force"]
