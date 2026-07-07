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
    ASSET_NAME="prospec-macos-${ARCH_NAME}.tar.gz"
else
    if [ "${ARCH_NAME}" != "x64" ]; then
        echo "Unsupported Linux architecture: ${ARCH_NAME}. Only x64 is supported." >&2;
        exit 1
    fi
    ASSET_NAME="prospec-linux-x64.tar.gz"
fi

DOWNLOAD_URL="https://github.com/${OWNER}/${REPO}/releases/latest/download/${ASSET_NAME}"

# Determine installation directory (under HOME to avoid requiring sudo)
INSTALL_DIR="${HOME}/.prospec/bin"
TARGET_PATH="${INSTALL_DIR}/prospec"

# Create installation directory if it doesn't exist
mkdir -p "${INSTALL_DIR}"

echo "Downloading ${ASSET_NAME} from latest release..."
TEMP_FILE=$(mktemp)

# Download asset (following redirects)
if ! curl -fsSL -o "${TEMP_FILE}" "${DOWNLOAD_URL}"; then
    echo "Error: Download failed from ${DOWNLOAD_URL}" >&2
    rm -f "${TEMP_FILE}"
    exit 1
fi

# Install binary
echo "Installing to ${TARGET_PATH}..."
# Extract the binary named "prospec" from the tar.gz into the INSTALL_DIR
if ! tar -xzf "${TEMP_FILE}" -C "${INSTALL_DIR}" prospec; then
    echo "Error: Failed to extract binary from ${TEMP_FILE}" >&2
    rm -f "${TEMP_FILE}"
    exit 1
fi

rm -f "${TEMP_FILE}"
chmod +x "${TARGET_PATH}"

echo "Successfully installed prospec to ${TARGET_PATH}!"

# Check and update PATH if not already present
SHELL_PROFILES=""
if [ -f "${HOME}/.zshrc" ]; then
    SHELL_PROFILES="${SHELL_PROFILES} ${HOME}/.zshrc"
fi
if [ -f "${HOME}/.bashrc" ]; then
    SHELL_PROFILES="${SHELL_PROFILES} ${HOME}/.bashrc"
fi
if [ -f "${HOME}/.bash_profile" ]; then
    SHELL_PROFILES="${SHELL_PROFILES} ${HOME}/.bash_profile"
fi
if [ -f "${HOME}/.profile" ]; then
    SHELL_PROFILES="${SHELL_PROFILES} ${HOME}/.profile"
fi

# If no profile exists, default to creating one based on current shell
if [ -z "${SHELL_PROFILES}" ]; then
    case "${SHELL}" in
        */zsh) SHELL_PROFILES="${HOME}/.zshrc" ;;
        *)     SHELL_PROFILES="${HOME}/.bashrc" ;;
    esac
fi

PATH_ADDED=false
for PROFILE in ${SHELL_PROFILES}; do
    # Check if the install directory is already in the PATH export pattern in that profile
    if ! grep -q "export PATH=.*\.prospec/bin" "${PROFILE}" 2>/dev/null; then
        echo "" >> "${PROFILE}"
        echo "# prospec path config" >> "${PROFILE}"
        echo "export PATH=\"\$HOME/.prospec/bin:\$PATH\"" >> "${PROFILE}"
        echo "Added \$HOME/.prospec/bin to ${PROFILE}"
        PATH_ADDED=true
    fi
done

if [ "${PATH_ADDED}" = true ]; then
    echo "PATH updated. Please restart your terminal/shell, or run: source <your-profile>"
fi

# Try executing prospec to verify installation
if command -v prospec >/dev/null 2>&1; then
    prospec --version
else
    # Fallback to direct execution if PATH is not loaded in current session yet
    "${TARGET_PATH}" --version
fi
