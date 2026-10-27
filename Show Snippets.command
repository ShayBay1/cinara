#!/bin/zsh
# Double-click to open the Snippets website and admin in your browser (uses the last web build in dist/).
cd "$(dirname "$0")"
(sleep 1.5; open "http://localhost:8090/admin") &
python3 scripts/serve-web.py 8090
