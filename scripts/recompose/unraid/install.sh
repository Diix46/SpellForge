#!/bin/bash
# Installs the weekly HD cards job on the Unraid server, from a Mac holding
# the print fonts. Run from the repository root, with a host your SSH setup
# reaches (a ~/.ssh/config alias, or user@address):
#
#   scripts/recompose/unraid/install.sh root@192.168.1.2
#
# 1. the fonts go to appdata/spellforge/fonts (private, never in the image);
# 2. the script becomes the User Script "spellforge_hd_cards";
# 3. it is scheduled every Sunday at 05:30 (after the app's 04:30 card refresh),
#    as the User Scripts page would write it. When other scripts are already
#    scheduled their schedule is kept: set this one by hand (Custom: 30 5 * * 0).
set -euo pipefail
HOST=${1:?usage: install.sh user@host}
HERE=$(cd "$(dirname "$0")" && pwd)
FONTS=(Beleren2016-Bold.ttf Matrix-Bold.ttf GoudyMediaeval-Regular.ttf PlantinMTProRg.TTF PlantinMTProRgIt.TTF PlantinMTProBold.TTF)
DIR=/boot/config/plugins/user.scripts/scripts/spellforge_hd_cards

ssh "$HOST" "mkdir -p /mnt/user/appdata/spellforge/fonts $DIR && chmod 700 /mnt/user/appdata/spellforge/fonts"
(cd "$HOME/Library/Fonts" && rsync -a "${FONTS[@]}" "$HOST:/mnt/user/appdata/spellforge/fonts/")
rsync -a "$HERE/spellforge_hd_cards.sh" "$HOST:$DIR/script"
ssh "$HOST" "echo 'SpellForge : cartes françaises HD des nouvelles impressions (dimanche 5h30)' > $DIR/description"

ssh "$HOST" 'bash -s' <<'REMOTE'
set -e
S=/boot/config/plugins/user.scripts/schedule.json
SCRIPT=/boot/config/plugins/user.scripts/scripts/spellforge_hd_cards/script
if [ -f "$S" ] && ! grep -q spellforge_hd_cards "$S"; then
  echo "Other scripts are scheduled: set spellforge_hd_cards to Custom '30 5 * * 0' in User Scripts."
  exit 0
fi
cat > "$S" <<JSON
{
    "$SCRIPT": {
        "script": "$SCRIPT",
        "frequency": "custom",
        "id": "schedule0",
        "custom": "30 5 * * 0"
    }
}
JSON
mkdir -p /tmp/user.scripts && cp "$S" /tmp/user.scripts/schedule.json
printf '# Generated cron schedule for user.scripts\n30 5 * * 0 /usr/local/emhttp/plugins/user.scripts/startCustom.php %s > /dev/null 2>&1\n\n' "$SCRIPT" \
  > /boot/config/plugins/user.scripts/customSchedule.cron
/usr/local/sbin/update_cron
echo "Scheduled: Sundays 05:30"
REMOTE
