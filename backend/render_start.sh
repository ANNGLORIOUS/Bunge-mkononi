#!/usr/bin/env bash
set -euo pipefail

exec python -m gunicorn bunge_backend.wsgi:application --bind 0.0.0.0:${PORT:-10000}
