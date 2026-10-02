# Scripts

## monthly-sync.ps1

What Windows Task Scheduler runs once a month. Runs the `monthly-sync` swamp
workflow and writes its JSON output to `.swamp/last-monthly-sync.json`.

## renew-psn.ps1

Run this when the game list page shows the red "not updated" banner: the PSN
login token (NPSSO) has expired. It opens Sony's token page, reads the token
from the clipboard, stores it in the `games` vault, checks the login, and runs
the sync at once so the list catches up.

```
pwsh -File scripts/renew-psn.ps1
```

It expects the token on the clipboard, put there by this bookmarklet. Open
`scripts/bookmarks.html` in Chrome and drag both buttons to the bookmarks bar,
or create a
bookmark named "Kopier PSN token" with this as its URL (one line):

```
javascript:(()=>{const t=document.body.innerText,m=t.match(/"npsso"\s*:\s*"([A-Za-z0-9]{64})"/),x=t.match(/"expires_in"\s*:\s*(\d+)/);if(!m){alert('Fant ikke token. Logg inn paa playstation.com og last siden paa nytt.');return}const d=x?new Date(Date.now()+x[1]*1000).toISOString().slice(0,10):'ukjent';navigator.clipboard.writeText(m[1]).then(()=>alert('PSN token kopiert. Gyldig til '+d+'.'),()=>prompt('Kopier denne:',m[1]))})()
```

Optional second bookmark, "PSN token", to the token page itself:
`https://ca.account.sony.com/api/v1/ssocookie`
