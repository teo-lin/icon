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

async function newTerminal(context, launch) {
  const folder = await chooseFolder();
  if (folder === null) return;
  vscode.window.createTerminal({ cwd: folder?.uri, ...launch, ...styleFor(context, folder) }).show();
}

const PLATFORM_KEY = { win32: 'windows', darwin: 'osx' }[process.platform] ?? 'linux';

const expandEnv = (text) => text.replace(/\$\{env:([^}]+)\}/gi, (_, name) => process.env[name] ?? '');

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// Absolute paths are checked as they are. A bare name such as "bash" or "pwsh" is looked up on PATH,
// the way VSCode's default Mac and Linux profiles are written.
function resolveExecutable(candidate) {
  const file = expandEnv(candidate);
  if (path.isAbsolute(file)) return isFile(file) ? file : undefined;
  if (/[\\/]/.test(file)) return undefined;
  const extensions =
    process.platform === 'win32' && !path.extname(file) ? (process.env.PATHEXT ?? '.EXE;.CMD').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const full = path.join(dir, file + extension);
      if (isFile(full)) return full;
    }
  }
  return undefined;
}

const firstExisting = (paths) => paths.map(resolveExecutable).find(Boolean);

// VSCode resolves "source" profiles internally and the extension API cannot, so look in the usual places.
function findPowerShell() {
  const base = path.join(process.env.ProgramFiles ?? '', 'PowerShell');
  const versions = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => /^\d+$/.test(v)).sort((a, b) => b - a) : [];
  const pwsh = firstExisting(versions.map((v) => path.join(base, v, 'pwsh.exe')));
  return pwsh ?? firstExisting(['${env:windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']);
}

// Mac and Linux: the "pwsh" source.
function findPwsh() {
  return firstExisting(['pwsh', '/usr/local/bin/pwsh', '/opt/homebrew/bin/pwsh', '/usr/bin/pwsh', '/snap/bin/pwsh']);
}

function findGitBash() {
  return firstExisting([
    '${env:ProgramFiles}\\Git\\bin\\bash.exe',
    '${env:ProgramFiles(x86)}\\Git\\bin\\bash.exe',
    '${env:LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe',
  ]);
}

function resolveProfile(profile) {
  let shellPath;
  let shellArgs = profile.args;
  if (profile.path) shellPath = firstExisting([].concat(profile.path));
  else if (profile.source === 'PowerShell') shellPath = findPowerShell();
  else if (profile.source === 'pwsh') shellPath = findPwsh();
  else if (profile.source === 'Git Bash') {
    shellPath = findGitBash();
    shellArgs ??= ['--login', '-i'];
  }
  return shellPath ? { shellPath, shellArgs, env: profile.env } : undefined;
}

async function pickProfile() {
  const configuration = vscode.workspace.getConfiguration('terminal.integrated');
  const profiles = configuration.get(`profiles.${PLATFORM_KEY}`) ?? {};
  const defaultName = configuration.get(`defaultProfile.${PLATFORM_KEY}`);
  const names = Object.keys(profiles).filter((name) => profiles[name]);
  names.sort((a, b) => (b === defaultName) - (a === defaultName));
  const items = names.map((name) => ({ label: name, description: name === defaultName ? 'default' : undefined }));
  const choice = await vscode.window.showQuickPick(items, { placeHolder: 'Select the terminal profile to start' });
  return choice && { name: choice.label, profile: profiles[choice.label] };
}

async function newTerminalWithProfile(context) {
  const choice = await pickProfile();
  if (!choice) return;
  const launch = resolveProfile(choice.profile);
  if (launch) return newTerminal(context, launch);
  vscode.window.showWarningMessage(
    `Repo Terminal: cannot find the shell for "${choice.name}". VSCode's own profile is used, without the repo icon.`,
  );
  return vscode.commands.executeCommand('workbench.action.terminal.newWithProfile', { profileName: choice.name });
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
    vscode.commands.registerCommand('repoTerminal.newWithProfile', () => newTerminalWithProfile(context)),
    vscode.commands.registerCommand('repoTerminal.split', () => splitTerminal(context)),
  );
}

module.exports = { activate, deactivate() {} };
