import { ProgressPromise } from './type';
import * as vscode from 'vscode';

export const log = (msg: string, ...items: string[]) => {
    return vscode.window.showErrorMessage(msg, ...items);
};

export const info = (msg: string, ...items: string[]) => {
    return vscode.window.showInformationMessage(msg, ...items);
};

export function withProgress(title: string) {
    return new Promise<ProgressPromise>(res => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
            title
        }, progress => {
            return new Promise<void>(r => {
                res({
                    progress,
                    res: r
                });
            });
        });
    });
}
