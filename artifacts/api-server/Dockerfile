FROM node:22-slim

WORKDIR /app

# Install Python, pip, and ffmpeg so startup doesn't block on pip install
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --quiet \
    "yt-dlp==2026.03.17" "curl_cffi==0.13.0" imageio-ffmpeg

RUN npm install -g pnpm@11

COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production

RUN pnpm --filter @workspace/api-server build

ENV PORT=3000

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
