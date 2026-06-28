FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
  HOME=/data \
  DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    file \
    git \
    locales \
    procps \
    tar \
    unzip \
    xz-utils \
    lib32gcc-s1 \
    lib32stdc++6 \
    libatomic1 \
    libc++1 \
    libc++abi1 \
    libc-bin \
    libcurl4 \
    libfontconfig1 \
    libgcc-s1 \
    libglib2.0-0 \
    libicu72 \
    libnss3 \
    libsdl2-2.0-0 \
    libssl3 \
    libstdc++6 \
    libuuid1 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    zlib1g \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1000 --user-group --create-home --home-dir /home/aethergame --shell /bin/bash aethergame \
  && mkdir -p /data \
  && chown -R 1000:1000 /data /home/aethergame

WORKDIR /data
USER 1000:1000
