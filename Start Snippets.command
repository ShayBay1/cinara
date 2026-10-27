#!/bin/zsh
# Double-click to start the Snippets app. Scan the QR code with your iPhone camera, or press "w" for the web version.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"
# Use the newest Node installed (the app needs Node 20.19 or newer).
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" && nvm use 22 >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1
command -v fnm >/dev/null && eval "$(fnm env)" && fnm use 22 >/dev/null 2>&1
for d in /opt/homebrew/opt/node@22/bin /opt/homebrew/opt/node@20/bin /usr/local/opt/node@22/bin /usr/local/opt/node@20/bin $HOME/.nvm/versions/node/*/bin(N); do
  [ -x "$d/node" ] && "$d/node" -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' && export PATH="$d:$PATH" && break
done
echo "Using Node $(node -v) from $(which node)"
echo "Other Node installs found:"; ls -d /opt/homebrew/opt/node* /usr/local/opt/node* $HOME/.nvm/versions/node/* $HOME/.volta 2>/dev/null
if ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)'; then
  echo; echo "Node 20 or newer is needed. Install it from https://nodejs.org (LTS), then double-click this file again."; exit 1
fi
npx expo start --clear
