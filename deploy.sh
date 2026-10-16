#!/bin/sh
# Build and (re)start the dashboard on the NAS.
# Usage (over SSH on the NAS):  cd /volume1/Projects/home-dashboard && sudo sh deploy.sh
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env - copy .env.example to .env and fill in your keys first." >&2
  exit 1
fi

# The dashboard reads the container list through the Docker socket; give it
# the socket's group so it can, without running as root.
DOCKER_GID=$(stat -c %g /var/run/docker.sock 2>/dev/null || echo 0)
export DOCKER_GID

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

$DC -f docker-compose.nas.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
$DC -f docker-compose.nas.yml ps
