# Repo Terminal Icon

Gives each new terminal an icon and a color for its workspace folder, so you can see which repo a terminal belongs to.

- If the folder name starts with an emoji (for example `🚀 api`), the terminal uses that emoji as its icon.
- If not, it uses a VSCode icon. The same folder always gets the same icon and color.
- In a window with more than one folder, it asks which folder to open the terminal in.
- A split terminal opens in the same folder as the terminal it splits.

## Commands

| Command | Mac | Windows / Linux |
|---|---|---|
| **Terminal: New Repo Terminal** | `` Ctrl+Shift+` `` | `` Ctrl+Shift+` `` |
| **Terminal: New Repo Terminal (Select Profile)** | | |
| **Terminal: Split Repo Terminal** | `Cmd+\` | `Ctrl+Shift+5` |

The new-terminal command is also the **+** button of the terminal panel, and the select-profile command is the **⌄** button next to it. It lists your terminal profiles (PowerShell, Git Bash, and so on) and starts the one you pick with the repo icon and color. The split command is also in the terminal right-click menu.
