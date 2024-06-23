#!/bin/sh

node ./auto.js --url https://miningcombo.com/hamster/ --output ./themes/hamster/layouts/partials/combo.html
git add ./themes/hamster/layouts/partials/combo.html
git add ./themes/hamster/layouts/partials/cipher.html
git add ./themes/hamster/layouts/partials/morse.html
# ammend the commit
git commit --amend --no-edit
# force push
git push -f