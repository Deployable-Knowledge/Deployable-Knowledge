import { stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	net,
	protocol,
	session,
	shell,
	type BrowserWindowConstructorOptions,
	type WebContents
} from 'electron';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD_ENTRY = join(APP_ROOT, 'build', 'adapter-node.js');
const CLIENT_DIR = join(APP_ROOT, 'build', 'client');
const PRELOAD_ENTRY = join(APP_ROOT, 'electron', 'preload.cjs');

const APP_ORIGIN = 'http://deployable-knowledge.localhost';

const VIEWER_WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
	width: 1100,
	height: 820,
	backgroundColor: '#101014',
	autoHideMenuBar: true
};

type AppServer = {
	init(options: { env: NodeJS.ProcessEnv }): Promise<void>;
	respond(request: Request, options: { getClientAddress: () => string }): Promise<Response>;
};

let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(start).catch(reportFatal);
}

async function start(): Promise<void> {
	installMenu();
	registerWindowControls();

	// Chromium blocks picking home, Documents, Desktop, and system folders. Chrome
	// explains that and reopens the picker, but Electron rejects it silently, which
	// the app cannot tell apart from a cancel.
	session.defaultSession.on('file-system-access-restricted', async (_event, details, callback) => {
		const { response } = await dialog.showMessageBox({
			type: 'warning',
			message: `“${details.path}” can't be opened`,
			detail: 'It is a protected location. Choose a folder inside it instead.',
			buttons: ['Choose another folder', 'Cancel'],
			defaultId: 0,
			cancelId: 1
		});
		callback(response === 0 ? 'tryAgain' : 'deny');
	});

	await serveApp();
	createWindow();
}

async function serveApp(): Promise<void> {
	process.chdir(app.getPath('userData'));
	process.env.DK_MIGRATIONS_DIR = join(APP_ROOT, 'drizzle');

	const { server }: { server: AppServer } = await import(pathToFileURL(BUILD_ENTRY).href);
	await server.init({ env: process.env });

	protocol.handle('http', async (request) => {
		if (!isAppPage(request.url)) return net.fetch(request, { bypassCustomProtocolHandlers: true });

		const asset = await findClientAsset(new URL(request.url).pathname);
		if (asset) return net.fetch(pathToFileURL(asset).href);

		return server.respond(request, { getClientAddress: () => '127.0.0.1' });
	});
}

async function findClientAsset(pathname: string): Promise<string | null> {
	const path = join(CLIENT_DIR, pathname);
	if (!path.startsWith(CLIENT_DIR + sep)) return null;

	const stats = await stat(path).catch(() => null);
	return stats?.isFile() ? path : null;
}

function createWindow(): void {
	const window = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 600,
		backgroundColor: '#101014',
		frame: false,
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			preload: PRELOAD_ENTRY,
			sandbox: true,
			spellcheck: false
		}
	});
	mainWindow = window;

	window.once('ready-to-show', () => window.show());
	window.on('closed', () => {
		mainWindow = null;
		app.quit();
	});
	window.on('maximize', () => window.webContents.send('window:maximized-changed', true));
	window.on('unmaximize', () => window.webContents.send('window:maximized-changed', false));

	routeLinks(window.webContents);

	void window.loadURL(APP_ORIGIN);
}

function routeLinks(contents: WebContents): void {
	contents.setWindowOpenHandler(({ url }) => {
		if (isAppPage(url)) {
			return { action: 'allow', overrideBrowserWindowOptions: VIEWER_WINDOW_OPTIONS };
		}
		void shell.openExternal(url);
		return { action: 'deny' };
	});

	contents.on('will-navigate', (event, url) => {
		if (isAppPage(url)) return;
		event.preventDefault();
		void shell.openExternal(url);
	});

	contents.on('did-create-window', (child) => routeLinks(child.webContents));
}

function isAppPage(url: string): boolean {
	return url.startsWith(`${APP_ORIGIN}/`);
}

function registerWindowControls(): void {
	ipcMain.on('window:minimize', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.minimize();
	});

	ipcMain.on('window:toggle-maximize', (event) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (window?.isMaximized()) window.unmaximize();
		else window?.maximize();
	});

	ipcMain.on('window:close', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});

	ipcMain.handle(
		'window:is-maximized',
		(event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
	);
}

function installMenu(): void {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate([
			{ role: 'fileMenu' },
			{ role: 'editMenu' },
			{ role: 'viewMenu' },
			{ role: 'windowMenu' }
		])
	);
}

function reportFatal(error: unknown): void {
	dialog.showErrorBox(
		'Deployable Knowledge failed to start',
		error instanceof Error ? (error.stack ?? error.message) : String(error)
	);
	app.exit(1);
}
