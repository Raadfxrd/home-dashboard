#!/bin/sh
# Update and (re)start the dashboard on the NAS.
#
#   cd /volume1/Projects/home-dashboard && sudo sh deploy.sh
#
# Downloads the image GitHub built from main (about a minute) and restarts
# the container. `sudo sh deploy.sh --build` builds the image on the NAS
# instead (slow, ~10-20 minutes), e.g. to try changes that aren't on main.
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
COMPOSE="$DC -f docker-compose.nas.yml"

if [ "$1" = "--build" ]; then
  echo "Building the image on the NAS..."
  $COMPOSE up -d --build --remove-orphans
else
  echo "Downloading the latest image..."
  if $COMPOSE pull; then
    $COMPOSE up -d --no-build --remove-orphans
  else
    echo "" >&2
    echo "Couldn't download the image. If the package on GitHub is still private," >&2
    echo "make it public (GitHub > your profile > Packages > home-dashboard >" >&2
    echo "Package settings > Change visibility), or run: sudo sh deploy.sh --build" >&2
    exit 1
  fi
fi

docker image prune -f >/dev/null
$COMPOSE ps
