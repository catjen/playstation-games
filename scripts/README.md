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

It expects the token on the clipboard, put there by this bookmarklet. Create a
bookmark named "Kopier PSN token" with this as its URL (one line):

```
javascript:(()=>{try{const v=JSON.parse(document.body.innerText).npsso;if(!v||v.length!==64)throw 0;navigator.clipboard.writeText(v).then(()=>alert('PSN token kopiert'),()=>prompt('Kopier denne:',v))}catch(e){alert('Fant ikke token. Logg inn paa playstation.com og last siden paa nytt.')}})()
```

Optional second bookmark, "PSN token", to the token page itself:
`https://ca.account.sony.com/api/v1/ssocookie`
