#!/bin/bash

# Simple check to see if lsof is available
if ! command -v lsof &> /dev/null
then
    echo "lsof could not be found, skipping dynamic origin detection."
    # Fallback to creating an empty .env.local if it doesn't exist
    if [ ! -f ".env.local" ]; then
        touch .env.local
    fi
    exit 0
fi

PORT=$(lsof -i -P -n | grep LISTEN | grep node | awk '{print $9}' | cut -d':' -f2 | head -n 1)

# Check if a port was found
if [ -z "$PORT" ]; then
  echo "Could not find a running Node.js port. Using default or existing DEV_ORIGIN."
  exit 0
fi

DOMAIN="${PORT}-firebase-studio-1755127519376.cluster-joak5ukfbnbyqspg4tewa33d24.cloudworkstations.dev"
DEV_ORIGIN_URL="https://${DOMAIN}"

# Create or update .env.local
echo "DEV_ORIGIN=${DEV_ORIGIN_URL}" > .env.local

echo "✅ .env.local actualizado con:"
echo "DEV_ORIGIN=${DEV_ORIGIN_URL}"
