# syntax=docker/dockerfile:1.7
# Gateway and disposable workers use the tested canonical runtime.
FROM ghcr.io/barkbarkbarkbarkbarkbarkbark/hosaka@sha256:40d47cdbe40fd8bdd173bded72f280ab98a69546c8f677c491ecfa42751f6cc5
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends iptables util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 --shell /bin/bash hosaka \
 && chmod 700 /root
# `hosaka update` fills runtime-overlay/ from the canonical checkout.
# A stock clone only has the README, so this image stays on the pinned runtime.
COPY runtime-overlay/ /tmp/hosaka-overlay/
RUN if [ -d /tmp/hosaka-overlay/hosaka ]; then \
      rm -rf /opt/hosaka-field-terminal/hosaka /opt/hosaka-field-terminal/examples/extensions && \
      mkdir -p /opt/hosaka-field-terminal/examples && \
      cp -a /tmp/hosaka-overlay/hosaka /opt/hosaka-field-terminal/hosaka && \
      cp -a /tmp/hosaka-overlay/examples/extensions /opt/hosaka-field-terminal/examples/extensions && \
      /opt/hosaka-field-terminal/.venv/bin/pip install --no-cache-dir -r /tmp/hosaka-overlay/requirements-hosaka.txt ; \
    fi \
 && rm -rf /tmp/hosaka-overlay
COPY agent-server/requirements.txt /app/requirements.txt
RUN /opt/hosaka-field-terminal/.venv/bin/pip install -r /app/requirements.txt
COPY agent-server/hosted_terminal.py agent-server/terminal_worker.py agent-server/worker-start.sh /app/
RUN chmod 755 /app/worker-start.sh
ENV HOME=/home/hosaka PYTHONPATH=/opt/hosaka-field-terminal
WORKDIR /app
HEALTHCHECK NONE
EXPOSE 8080
ENTRYPOINT ["/usr/bin/setpriv", "--reuid=10001", "--regid=10001", "--init-groups", "--bounding-set=-all", "--no-new-privs", "/opt/hosaka-field-terminal/.venv/bin/python", "-m", "uvicorn", "hosted_terminal:app", "--host", "0.0.0.0", "--port", "8080", "--ws-max-size", "32768", "--no-access-log"]
