#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-org-radar}"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CLI_BIN_DIR="${CLI_BIN_DIR:-/usr/local/bin}"
CLI_NAME="${CLI_NAME:-org-radar}"
CLI_ALIAS="${CLI_ALIAS:-or}"

sudo systemctl disable --now "${SERVICE_NAME}" 2>/dev/null || true
sudo rm -f "${SERVICE_FILE}"
sudo rm -f "${CLI_BIN_DIR}/${CLI_NAME}" "${CLI_BIN_DIR}/${CLI_ALIAS}"
sudo systemctl daemon-reload

echo "Uninstalled ${SERVICE_NAME}."
