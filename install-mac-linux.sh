#!/bin/bash

echo "============================================"
echo " Claude Code Development Framework Installer"
echo "============================================"
echo ""

# Check if .claude folder exists
if [ ! -d "$HOME/.claude" ]; then
    mkdir -p "$HOME/.claude"
    echo "Created .claude folder."
else
    echo ".claude folder already exists."
fi

# Check for existing CLAUDE.md
if [ -f "$HOME/.claude/CLAUDE.md" ]; then
    echo ""
    echo "WARNING: CLAUDE.md already exists at $HOME/.claude/CLAUDE.md"
    read -p "Overwrite? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
        echo "Skipping CLAUDE.md"
    else
        cp "CLAUDE.md" "$HOME/.claude/CLAUDE.md"
        echo "Installed CLAUDE.md"
    fi
else
    cp "CLAUDE.md" "$HOME/.claude/CLAUDE.md"
    echo "Installed CLAUDE.md"
fi

# Check for existing settings.json
if [ -f "$HOME/.claude/settings.json" ]; then
    echo ""
    echo "WARNING: settings.json already exists at $HOME/.claude/settings.json"
    echo "You may want to manually merge the permissions and hooks."
    echo "A copy has been saved as settings-framework.json for reference."
    cp "settings.json" "$HOME/.claude/settings-framework.json"
else
    cp "settings.json" "$HOME/.claude/settings.json"
    echo "Installed settings.json"
fi

echo ""
echo "============================================"
echo " Installation complete!"
echo "============================================"
echo ""
echo "What was installed:"
echo "  $HOME/.claude/CLAUDE.md     (framework rules)"
echo "  $HOME/.claude/settings.json (permissions and hooks)"
echo ""
echo "To start using it:"
echo "  1. Open a terminal in any project folder"
echo "  2. Run: claude"
echo "  3. Tell Claude what you want to build"
echo "  4. The framework kicks in automatically"
echo ""
echo "Templates for docs files are in the templates/ folder."
