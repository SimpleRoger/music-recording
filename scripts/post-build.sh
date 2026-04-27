#!/bin/bash
set -e

# Install curl_cffi so yt-dlp can impersonate Chrome at the TLS level.
# This is required in production because Replit's server IPs are flagged
# by YouTube's bot detection even when valid cookies are provided.
# Version 0.13.0 is the last version yt-dlp recognises as a request handler.
echo "[post-build] Installing curl_cffi 0.13.0..."
python -m pip install --quiet "curl_cffi==0.13.0"
echo "[post-build] curl_cffi installed."

# Standard pnpm cleanup
pnpm store prune
