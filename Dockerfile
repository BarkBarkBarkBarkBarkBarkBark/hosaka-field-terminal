# syntax=docker/dockerfile:1.7
#
# Root-level Dockerfile for the Hosaka agent-server (FastAPI + picoclaw).
# This file sits at the repo root so `fly deploy` and `fly launch` can find
# it without extra flags.  The actual Python sources live under agent-server/
# and are copied in explicitly below.  Everything else in the repo is kept
# out of the build context by .dockerignore.
#
# Default target is linux/amd64 (Fly.io shared-cpu-1x).  Build with
# `docker buildx build --platform linux/arm64 ...` for arm Machines.

ARG PICOCLAW_VERSION=v0.2.6

FROM python:3.12-slim AS base

ARG PICOCLAW_VERSION
ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# tools to fetch picoclaw + basic niceties for the agent's shell tools
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl tar dumb-init tini coreutils jq less \
 && rm -rf /var/lib/apt/lists/*

# Download the right picoclaw build for this image's arch.
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  asset="picoclaw_Linux_x86_64.tar.gz" ;; \
      aarch64|arm64) asset="picoclaw_Linux_arm64.tar.gz" ;; \
      armv7l)  asset="picoclaw_Linux_armv7.tar.gz" ;; \
      armv6l)  asset="picoclaw_Linux_armv6.tar.gz" ;; \
      riscv64) asset="picoclaw_Linux_riscv64.tar.gz" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/sipeed/picoclaw/releases/download/${PICOCLAW_VERSION}/${asset}"; \
    echo "fetching $url"; \
    curl -fsSL "$url" -o /tmp/picoclaw.tgz; \
    tar -xzf /tmp/picoclaw.tgz -C /usr/local/bin picoclaw; \
    chmod +x /usr/local/bin/picoclaw; \
    rm /tmp/picoclaw.tgz; \
    /usr/local/bin/picoclaw --version || /usr/local/bin/picoclaw version || true

# Non-root user; agent runs here
RUN useradd --create-home --shell /bin/bash --uid 10001 hosaka \
 && mkdir -p /workspaces /home/hosaka/.picoclaw \
 && chown -R hosaka:hosaka /workspaces /home/hosaka

WORKDIR /app
COPY agent-server/requirements.txt ./
RUN pip install -r requirements.txt

COPY agent-server/server.py agent-server/start.sh ./
COPY agent-server/seed ./seed/
RUN chmod +x start.sh \
 && chmod -R +x seed/bin/ 2>/dev/null || true \
 && chown -R hosaka:hosaka /app

USER hosaka
ENV HOME=/home/hosaka \
    HOSAKA_WORKSPACE_ROOT=/workspaces \
    PORT=8080

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "./start.sh"]
