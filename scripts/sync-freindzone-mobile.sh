#!/data/data/com.termux/files/usr/bin/bash
set -e

SOURCE="$HOME/BluetoothMeetApp"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO/mobile"

if [ ! -d "$SOURCE/src" ] || [ ! -f "$SOURCE/package.json" ]; then
  echo "ERREUR : projet Expo introuvable dans $SOURCE"
  exit 1
fi

if [ ! -d "$REPO/.git" ]; then
  echo "ERREUR : dépôt Git introuvable."
  exit 1
fi

mkdir -p "$DEST"

echo "Synchronisation de FreindZone..."
tar -C "$SOURCE" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env*' \
  --exclude='.expo' \
  --exclude='dist' \
  --exclude='*.backup*' \
  --exclude='*.bak*' \
  --exclude='*backup*' \
  --exclude='*.before-*' \
  --exclude='*.avant-*' \
  --exclude='sauvegarde*' \
  --exclude='diagnostic*' \
  --exclude='fz-build*' \
  --exclude='*.original' \
  --exclude='*.log' \
  -cf - . | tar -C "$DEST" -xf -

for file in \
  src/app/home.tsx \
  src/app/private-chat.tsx \
  src/app/public.tsx \
  src/app/where.tsx
do
  sed -i 's/[[:blank:]]*$//' "$DEST/$file"
done

echo ""
echo "=== SYNCHRONISATION TERMINÉE ==="
cd "$REPO"
git status --short
echo ""
echo "Aucun commit ni push automatique."
