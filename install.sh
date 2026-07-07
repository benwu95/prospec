#!/bin/sh
set -e

# Repository configuration
OWNER="benwu95"
REPO="prospec"

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux)  OS_NAME="linux" ;;
    Darwin) OS_NAME="macos" ;;
    *)      echo "Unsupported OS: ${OS}" >&2; exit 1 ;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "${ARCH}" in
    x86_64|amd64) ARCH_NAME="x64" ;;
    arm64|aarch64) ARCH_NAME="arm64" ;;
    *)            echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

# Determine correct asset name
if [ "${OS_NAME}" = "macos" ]; then
    ASSET_NAME="prospec-macos-${ARCH_NAME}"
else
    if [ "${ARCH_NAME}" != "x64" ]; then
        echo "Unsupported Linux architecture: ${ARCH_NAME}. Only x64 is supported." >&2;
        exit 1
    fi
    ASSET_NAME="prospec-linux-x64"
fi

DOWNLOAD_URL="https://github.com/${OWNER}/${REPO}/releases/latest/download/${ASSET_NAME}"

# Determine installation directory (default to /usr/local/bin)
INSTALL_DIR="/usr/local/bin"
TARGET_PATH="${INSTALL_DIR}/prospec"

echo "Downloading ${ASSET_NAME} from latest release..."
TEMP_FILE=$(mktemp)

# Download asset (following redirects)
if ! curl -fsSL -o "${TEMP_FILE}" "${DOWNLOAD_URL}"; then
    echo "Error: Download failed from ${DOWNLOAD_URL}" >&2
    rm -f "${TEMP_FILE}"
    exit 1
fi

# Install binary
echo "Installing to ${TARGET_PATH} (may prompt for sudo)..."
if [ -w "${INSTALL_DIR}" ]; then
    mv "${TEMP_FILE}" "${TARGET_PATH}"
    chmod +x "${TARGET_PATH}"
else
    sudo mv "${TEMP_FILE}" "${TARGET_PATH}"
    sudo chmod +x "${TARGET_PATH}"
fi

echo "Successfully installed prospec to ${TARGET_PATH}!"
prospec --version
