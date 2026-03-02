rm -rf .git
git init
git add -A
git commit -m "Initial clean upload"
git branch -M master
git remote add origin https://github.com/lucakassab/WPA360.git
git push -f origin master