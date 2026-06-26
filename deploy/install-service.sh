#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-org-radar}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/org-radar.service.template"
CLI_TEMPLATE_FILE="${SCRIPT_DIR}/org-radar-cli.template"
ENV_FILE="${PROJECT_DIR}/.env"
ENV_EXAMPLE="${PROJECT_DIR}/.env.example"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CLI_BIN_DIR="${CLI_BIN_DIR:-/usr/local/bin}"
CLI_NAME="${CLI_NAME:-org-radar}"
CLI_ALIAS="${CLI_ALIAS:-or}"
CLI_FILE="${CLI_BIN_DIR}/${CLI_NAME}"
CLI_ALIAS_FILE="${CLI_BIN_DIR}/${CLI_ALIAS}"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "${RUN_USER}")"
USER_HOME="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
NPM_BIN="$(command -v npm)"
PATH_VALUE="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${USER_HOME}/.local/bin"

if [[ ! -f "${TEMPLATE_FILE}" ]]; then
  echo "Missing service template: ${TEMPLATE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${CLI_TEMPLATE_FILE}" ]]; then
  echo "Missing CLI template: ${CLI_TEMPLATE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE} from .env.example."
  echo "Using default .env values. Edit ${ENV_FILE} later and run '${CLI_ALIAS} restart' to apply changes."
fi

if grep -q '^ACCESS_CODE=change-me$' "${ENV_FILE}"; then
  echo "Please change ACCESS_CODE in ${ENV_FILE} before installing the service." >&2
  exit 1
fi

sudo sed \
  -e "s|__SERVICE_USER__|${RUN_USER}|g" \
  -e "s|__SERVICE_GROUP__|${RUN_GROUP}|g" \
  -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
  -e "s|__USER_HOME__|${USER_HOME}|g" \
  -e "s|__PATH__|${PATH_VALUE}|g" \
  -e "s|__ENV_FILE__|${ENV_FILE}|g" \
  -e "s|__NPM_BIN__|${NPM_BIN}|g" \
  "${TEMPLATE_FILE}" | sudo tee "${SERVICE_FILE}" >/dev/null

sudo sed \
  -e "s|__SERVICE_NAME__|${SERVICE_NAME}|g" \
  -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
  -e "s|__PRIMARY_COMMAND__|${CLI_FILE}|g" \
  -e "s|__ALIAS_COMMAND__|${CLI_ALIAS_FILE}|g" \
  "${CLI_TEMPLATE_FILE}" | sudo tee "${CLI_FILE}" >/dev/null
sudo chmod 755 "${CLI_FILE}"
sudo ln -sf "${CLI_FILE}" "${CLI_ALIAS_FILE}"

npm run install:all
npm run build

sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

echo "Installed and started ${SERVICE_NAME}."
echo "Installed CLI commands: ${CLI_FILE}, ${CLI_ALIAS_FILE}"
sudo systemctl --no-pager --lines=10 status "${SERVICE_NAME}"
