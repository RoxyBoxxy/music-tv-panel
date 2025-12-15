# -----------------------------
# STAGE 1 — Build full FFmpeg 8.x
# -----------------------------
FROM ghcr.io/roxyboxxy/fluxtv:dev

WORKDIR /app


# Copy package files
COPY package*.json ./

# Install dependencies (best practice)
RUN npm ci

# Copy the full project
COPY engine ./engine
COPY db ./db
COPY libs ./libs
COPY public ./public
COPY media ./media
COPY overlay ./overlay
COPY views ./views
COPY server.js .
COPY logo.png .
COPY postcss.config.js .
COPY tailwind.config.js .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

# Expose port (tell me which one your project uses)
EXPOSE 4456

# Start command — update if needed
CMD ["bash", "entrypoint.sh"]