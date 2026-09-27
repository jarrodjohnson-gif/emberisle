# How a friend installs and joins (issue #63)

Source: build bible 2.1 to 2.3. Some details (the exact exe path) wait on #62.

## What Jarrod sends

A private Google Drive folder named **Emberisle** with:

- `Emberisle-Windows.zip`
- `Emberisle-Mac.zip`, only if #61 says yes
- One line in the chat: **"Unzip. Run Emberisle. Code is in the group chat."**

## What the friend does (under a minute)

1. Download `Emberisle-Windows.zip`.
2. Right-click → **Extract All** → Extract. (Running it from inside the zip fails.)
3. Open the extracted `Emberisle` folder and double-click **`Emberisle.exe`**.
4. If Windows SmartScreen says "Windows protected your PC", click **More info → Run anyway**. The build is unsigned, and a private friends build expects this.
5. Click **Join with a code**. Type the 4 characters from the group chat, for example `K7QP`.
6. Pick a name, a color, and optionally a picture. Click **Sit down**, then **Ready**.

The friend never types a URL. The server address is baked in (#60). Only if Jarrod says so do they click the gear and paste the address he sends.

## What Jarrod does on game night

1. Turn on the host PC. Run `cd server && npm run host` and `cloudflared tunnel run emberisle`.
2. Open Emberisle, click **Host a table**, and post the 4-character code in the group chat.

## Errors a friend can see

| Message | Meaning |
|---|---|
| No table with that code | Typo, or Jarrod's table is closed |
| Table full. | 4 people are already seated |
| Color taken. | Pick another swatch |
| Game already started. | Wait for the next game |
| Lost the table | Jarrod's PC or tunnel stopped |
