# -----------------------------
# STAGE 1 — Build full FFmpeg 8.x
# -----------------------------
FROM debian:bookworm AS ffmpeg-build

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    autoconf \
    automake \
    build-essential \
    cmake \
    git \
    libass-dev \
    libfreetype6-dev \
    libfribidi-dev \
    libmp3lame-dev \
    libopus-dev \
    libtheora-dev \
    libtool \
    libvorbis-dev \
    libvpx-dev \
    libwebp-dev \
    libx264-dev \
    libx265-dev \
    libnuma-dev \
    libsoxr-dev \
    libbluray-dev \
    libzimg-dev \
    libzvbi-dev \
    libspeex-dev \
    nasm \
    ninja-build \
    pkg-config \
    texinfo \
    wget \
    yasm \
    zlib1g-dev \
    libssl-dev \
    libaom-dev \
    libsvtav1-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Build fdk-aac (required for --enable-libfdk-aac)
RUN git clone https://github.com/mstorsjo/fdk-aac.git && \
    cd fdk-aac && \
    autoreconf -fiv && \
    ./configure --enable-shared=no --enable-static=yes && \
    make -j$(nproc) && \
    make install

# Clone FFmpeg 8.x
RUN git clone https://git.ffmpeg.org/ffmpeg.git ffmpeg && \
    cd ffmpeg && \
    git checkout release/8.0

# Configure full-feature FFmpeg build
RUN cd ffmpeg && ./configure \
  --enable-gpl \
  --enable-version3 \
  --enable-nonfree \
  --enable-static \
  --disable-shared \
  --disable-debug \
  --disable-doc \
  --disable-ffplay \
  --enable-libx264 \
  --enable-libx265 \
  --enable-libfdk-aac \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-libvorbis \
  --enable-libass \
  --enable-libfreetype \
  --enable-libfribidi \
  --enable-libbluray \
  --enable-libaom \
  --enable-libsvtav1 \
  --enable-libsoxr \
  --enable-libwebp \
  --enable-libzimg \
  --enable-libzvbi \
  --enable-libspeex \
  --enable-filters \
  --enable-avfilter \
  --enable-protocol=all \
  --enable-encoder=all \
  --enable-decoder=all \
  --enable-muxer=all \
  --enable-demuxer=all \
  --enable-parser=all \
  --enable-bsf=all \
  --enable-indev=all \
  --enable-outdev=all

RUN cd ffmpeg && make -j$(nproc)

RUN apt-get update && apt-get install -y fonts-dejavu-core


ARG TARGETARCH
RUN echo "Installing yt-dlp for architecture: ${TARGETARCH}" && \
    if [ "$TARGETARCH" = "amd64" ]; then \
        curl -L -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        curl -L -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64; \
    else \
        echo "Unsupported architecture: $TARGETARCH" && exit 1; \
    fi && \
    chmod +x /usr/local/bin/yt-dlp && \
    yt-dlp --version
# -----------------------------
# STAGE 2 — Final Node runtime
# -----------------------------
FROM node:20-bookworm

WORKDIR /app

# Copy FFmpeg + FFprobe
COPY --from=ffmpeg-build /build/ffmpeg/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg-build /build/ffmpeg/ffprobe /usr/local/bin/ffprobe

RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && ffmpeg -version

# Copy package files
COPY package*.json ./

# Install dependencies (best practice)
RUN npm install

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

# Expose port (tell me which one your project uses)
EXPOSE 4456

# Start command — update if needed
CMD ["node", "server.js"]