const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const COLORS = ['ansiRed', 'ansiGreen', 'ansiYellow', 'ansiBlue', 'ansiMagenta', 'ansiCyan'];
const ICONS = ['rocket', 'beaker', 'flame', 'zap', 'star-full', 'heart', 'bug', 'coffee', 'globe', 'squirrel', 'telescope', 'tools', 'package', 'book', 'cloud', 'database'];
const EMOJI = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)/u;

const hash = (text) => [...text].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7);
const pick = (list, seed) => list[seed % list.length];

function firstEmoji(name) {
  const first = new Intl.Segmenter().segment(name)[Symbol.iterator]().next().value?.segment ?? '';
  return EMOJI.test(first) ? first : undefined;
}

function emojiIcon(context, emoji) {
  const dir = context.globalStorageUri.fsPath;
  const file = path.join(dir, `${hash(emoji)}.svg`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><text x="8" y="13.5" font-size="14" text-anchor="middle">${emoji}</text></svg>`);
  }
  return vscode.Uri.file(file);
}

function styleFor(context, folder) {
  const seed = folder ? hash(folder.name) : Math.floor(Math.random() * 1e9);
  const emoji = folder && firstEmoji(folder.name);
  return {
    color: new vscode.ThemeColor(`terminal.${pick(COLORS, seed)}`),
    iconPath: emoji ? emojiIcon(context, emoji) : new vscode.ThemeIcon(pick(ICONS, seed >>> 3)),
  };
}

// Returns null when the user cancels the picker, undefined when the window has no folder.
async function chooseFolder() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length <= 1) return folders[0];
  const editor = vscode.window.activeTextEditor;
  const active = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri);
  const ordered = active ? [active, ...folders.filter((f) => f.index !== active.index)] : folders;
  const item = await vscode.window.showQuickPick(
    ordered.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Select current working directory for new terminal' },
  );
  return item ? item.folder : null;
}

function cwdOf(terminal) {
  const cwd = terminal.shellIntegration?.cwd ?? terminal.creationOptions?.cwd;
  if (!cwd) return undefined;
  return typeof cwd === 'string' ? vscode.Uri.file(cwd) : cwd;
}

async function newTerminal(context) {
  const folder = await chooseFolder();
  if (folder === null) return;
  vscode.window.createTerminal({ cwd: folder?.uri, ...styleFor(context, folder) }).show();
}

async function splitTerminal(context) {
  const parent = vscode.window.activeTerminal;
  if (!parent) return newTerminal(context);
  const cwd = cwdOf(parent);
  const folder = cwd ? vscode.workspace.getWorkspaceFolder(cwd) : await chooseFolder();
  if (folder === null) return;
  const location = { parentTerminal: parent };
  vscode.window.createTerminal({ cwd: cwd ?? folder?.uri, location, ...styleFor(context, folder) }).show();
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('repoTerminal.new', () => newTerminal(context)),
    vscode.commands.registerCommand('repoTerminal.split', () => splitTerminal(context)),
  );
}

module.exports = { activate, deactivate() {} };
