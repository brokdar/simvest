#!/bin/bash
set -e

echo "🚀 Initializing development environment..."

curl --proto '=https' --tlsv1.2 -LsSf https://github.com/j178/prek/releases/download/v0.4.0/prek-installer.sh | sh
export PATH="$HOME/.local/bin:$PATH"
prek install

curl -fsSL https://claude.ai/install.sh | bash

echo "✅ Development environment setup complete!"