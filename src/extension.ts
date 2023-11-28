// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import TagProvider from './provider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const provider =  new TagProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TagProvider.viewType, provider, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);

	const register = (name: string, cb: () => void) => {
		return vscode.commands.registerCommand(name, cb);
	};

	context.subscriptions.push(
		register('gentags.refresh', () => {
			provider.getGitTimes = 0;
			provider.init();
		}),
	);
	provider.getGitTimes = 0;
	provider.init();
}

// This method is called when your extension is deactivated
export function deactivate() {}
