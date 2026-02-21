#!/bin/sh

node ./auto.js --url https://miningcombo.com/hamster/ --output ./themes/hamster/layouts/partials/combo.html
git add ./themes/hamster/layouts/partials/combo.html
git add ./themes/hamster/layouts/partials/cipher.html
git add ./themes/hamster/layouts/partials/morse.html
# Limit output check to the specific files we added
if ! git diff --cached --quiet ./themes/hamster/layouts/partials/combo.html ./themes/hamster/layouts/partials/cipher.html ./themes/hamster/layouts/partials/morse.html; then
  # ammend the commit
  git commit --amend --no-edit
  # force push
  git push -f
fi