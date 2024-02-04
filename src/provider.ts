import * as vscode from 'vscode';
import { Repository } from './type';
import { format } from 'date-fns';
import spawnCMD from 'spawn-command';

const isWindows = process.platform === 'win32';

const path = require('path');
const { Uri } = vscode;
import { log } from './utils';

type ProgressInfo = {
    status: 'error' | 'success' | 'pending' | 'notStart';
    text: string;
    hide?: boolean;
};
const getDefaultInfo: () => ProgressInfo[] = () => {
    return [
        { status: 'notStart', text: '修改 package.json#tag' },
        { status: 'notStart', text: 'git add package.json' },
        { status: 'notStart', text: 'git commit package.json' },
        { status: 'notStart', text: 'git tag' },
        { status: 'notStart', text: 'git push' },
    ];
};
const getInitInfo: () => ProgressInfo[] = () => {
    return [
        { status: 'notStart', text: '获取 package.json#tagPrefix' },
        { status: 'notStart', text: '初始化 git' },
        { status: 'notStart', text: '获取 tags' },
    ];
};

export default class TagProvider implements vscode.WebviewViewProvider {

    public static readonly viewType: string = 'gen.tags';
    private _view?: vscode.WebviewView;
    public repo?: Repository;
    public tags: Record<string, string[]> = {};
    public formData: {
        prefix: string;
        suffix: string;
        versionType: string;
        editPkg: boolean;
    } = {
        prefix: '',
        suffix: '',
        versionType: 'patch',
        editPkg: true,
    };
    public newTag: string = '';
    private pkgContent: any = {};
    private resultInfo: ProgressInfo[] = getDefaultInfo();
    private initInfo: ProgressInfo[] = getInitInfo();
    public getGitTimes: number = 0;
    
    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            // Allow scripts in the webview
			enableScripts: true,
            localResourceRoots: [
				this._extensionUri
			]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(msg => {
			switch (msg.type) {
                case 'init': 
                    this.getGitTimes = 0;
                    this.init();
                    break;
                case 'formChange':
                    this.formData = msg.data;
                    this.genTag();
                    break;
                case 'submit':
                    this.handleSubmit();
                    break;
			}
		});
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'main.js'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'vscode.css'));
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'reset.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'assets', 'main.css'));

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <!--
                Use a content security policy to only allow loading images from https or from our extension directory,
                and only allow scripts that have a specific nonce.
            -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleResetUri}" rel="stylesheet">
            <link href="${styleVSCodeUri}" rel="stylesheet">
            <link href="${styleMainUri}" rel="stylesheet">
            <title>Cat Colors ${scriptUri}</title>
        </head>
        <body>
            <div class="tags-wrap">
                <div class="flex-wrap">
                    <div class="tags-form">
                        <p class="tags-label">Tag 前缀</p>
                        <select id="prefix" class="tags-target-branch branches-select form" name="tag_prefix">
                        </select>
                        <p class="tags-label">版本类型</p>
                        <select id="versionType" class="tags-target-branch branches-select form" name="version_type">
                            <option value="major">major</option>
                            <option value="minor">minor</option>
                            <option value="patch" selected>patch</option>
                            <option value="RC">RC</option>
                        </select>
                        <p class="tags-label">Tag 后缀</p>
                        <input id="suffix" class="tags-title form" type="text" name="tag_suffix" />
                        <div class="tags-checkbox">
                            <input id="editPkg" class="checkbox" checked type="checkbox" name="edit_pkg">
                            <label for="editPkg">将生成的 tag 存到 package.json#tag 中，并提交更改。</label>
                        </div>
                        <p class="tag-value" id="tag"></p>
                    </div>
                </div>
                <div class="footer">
                    <button class="tags-btn" disabled id="submitBtn">推送 Tag</button>
                    <div class="w-full">
                        <div id="progressList" class="progress"></div>
                        <div id="successTips" class="success-tips">
                            <div class="pro-icon">✓</div>
                            <div>操作成功</div>
                        </div>
                        <button class="tags-btn reload-btn" id="refreshBtn">刷新</button>
                    </div>
                </div>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    async init() {
        this.postMsg('successTips', false);
        this.disableSubmit();
        this.postMsg('updateProgress', '');
        this.resultInfo = getInitInfo();

        this.editInfo(0, 'pending', this.initInfo);
        const pkgStr = await this.optFile(
            './package.json',
            undefined,
            () => '',
            () => this.editInfo(0, 'error', this.initInfo)
        ) || '';
        await new Promise<void>((res, rej) => {
            try {
                this.pkgContent = JSON.parse(pkgStr);
                const prefix = this.pkgContent['tagPrefix'] || [];
                setTimeout(() => this.postMsg('prefixOptions', prefix));
                this.editInfo(0, 'success', this.initInfo);
                res();
            } catch (e) {
                this.editInfo(0, 'error', this.initInfo);
                rej();
            }
        });

        this.editInfo(1, 'pending', this.initInfo);
        await this.exeCmd('git rev-parse', () => '', () => this.editInfo(1, 'error', this.initInfo));
        this.editInfo(1, 'success', this.initInfo);
        this.editInfo(2, 'pending', this.initInfo);
        await this.exeCmd(
            isWindows ? 'git tag | ForEach-Object { git tag -d $_ }' : 'git tag | xargs git tag -d',
            () => '',
            () => this.editInfo(2, 'error', this.initInfo)
        );
        await this.exeCmd('git fetch --tags', () => '', () => this.editInfo(2, 'error', this.initInfo));
        const tags = await this.exeCmd('git tag', () => '', () => this.editInfo(2, 'error', this.initInfo));
        this.tags = this.resolveTags(tags.split('\n').filter(item => item !== ''));
        this.editInfo(2, 'success', this.initInfo);
        this.genTag();
        this.postMsg('updateProgress', '');
        this.disableSubmit(false);
        this.resultInfo = getDefaultInfo();
    }

    postMsg(type: string, data?: any) {
        this._view?.webview.postMessage({ type, data });
    }
    disableSubmit(disable = true) {
        this.postMsg('disableSubmit', disable);
    }

    getWorkspaceFilePath(fileName: string) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            return path.join(workspaceRoot, fileName);
        } else {
            vscode.window.showInformationMessage('No workspace folder is open.');
            return '';
        }
    }
    
    async optFile(filePath: string, content: string | undefined, successCb?: (...arg: any) => void, errorCb?: () => void) {
        return new Promise<string | void>(async(res, rej) => {
            const fullPath = this.getWorkspaceFilePath(filePath);
            const fileUri = Uri.file(fullPath);
            try {
                if (typeof content === 'string') {
                    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));
                    successCb?.();
                    res();
                } else {
                    const byteArray = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = Buffer.from(byteArray).toString('utf8');
                    successCb?.(fileContent);
                    res(fileContent);
                }
            } catch (err) {
                log(`${filePath}: ${err}`);
                errorCb?.();
                rej();
            }
        });
    }
    
    resolveTags(tags: string[]) {
        const result: Record<string, string[]> = {};
        tags.forEach(version => {
            const match = version.match(/(.*?)(\d+\.\d+\.\d+)/);
            if (match) {
                const [, prefix, versionNumber] = match;
                if (prefix && versionNumber) {
                    if (!result[prefix]) {
                        result[prefix] = [];
                    }
                    result[prefix].push(versionNumber);
                }
            }
        });
        return result;
    }
    
    latestTag(data: string[]) {
        const tag = data.sort((a, b) => {
            const aArr = a.split('.');
            const bArr = b.split('.');
            if (aArr[0] === bArr[0]) {
                if (aArr[1] === bArr[1]) {
                    return Number(aArr[2]) - Number(bArr[2]);
                }
                return Number(aArr[1]) - Number(bArr[1]);
            }
            return Number(aArr[0]) - Number(bArr[0]);
        }).pop();
        return tag || '0.0.0';
    }
    
    genTag() {
        const { prefix, suffix, versionType } = this.formData;
        let version = this.latestTag(this.tags[prefix] || []);
        const updateIndex = ['major', 'minor', 'patch'].indexOf(versionType);
        if (updateIndex > -1) {
            const versionArr = version.split('.');
            versionArr[updateIndex] = String(Number(versionArr[updateIndex]) + 1);
            for (let i = updateIndex + 1; i < versionArr.length; i++) {
                versionArr[i] = '0';
            }
            version = versionArr.join('.');
        } else {
            version = version + '-' + versionType + '-' + format(new Date(), 'yyyyMMddHHmmss');
        }
        this.newTag = prefix + version + suffix;
        this.postMsg('updateTag', this.newTag);
    }

    editInfo(index: number, status: ProgressInfo["status"], info: ProgressInfo[] = this.resultInfo) {
        info[index].status = status;
        this.updateProgress(info);
    }

    exeCmd(cmd: string, successCb?: (...arg: any) => void, errorCb?: () => void) {
        let commandOutput = '';
        let errorOutput = '';
        return new Promise<string>((res, rej) => {
            const execCommand = isWindows ? `powershell -Command "${cmd}"` : cmd;
            const process = spawnCMD(execCommand, {
                cwd: this.getWorkspaceFilePath(''),
            });
            process.stdout.on('data', (data: ArrayBuffer) => {
                commandOutput += data.toString();
            });
            process.stderr.on('data', (data: ArrayBuffer) => {
                errorOutput = data.toString();
            });
            process.on('close', (status: 0 | 1) => {
                if (status === 0) {
                    successCb?.(commandOutput);
                    res(commandOutput);
                } else {
                    errorCb?.();
                    rej();
                    errorOutput && log(errorOutput);
                }
            });
        });
    }
    
    async handleSubmit() {
        this.disableSubmit();
        if (this.formData.editPkg) {
            this.editInfo(0, 'pending');
            this.pkgContent.tag = this.newTag;
            await this.optFile(
                './package.json',
                JSON.stringify(this.pkgContent, null, 4),
                () => this.editInfo(0, 'success'),
                () => this.editInfo(0, 'error')
            );
            this.editInfo(1, 'pending');
            await this.exeCmd(`git add package.json`, () => this.editInfo(1, 'success'), () => this.editInfo(1, 'error'));
            this.editInfo(2, 'pending');
            await this.exeCmd(
                `git commit -m 'build: update package.json#tag' --no-verify`,
                () => this.editInfo(2, 'success'),
                () => this.editInfo(2, 'error'),
            );
        } else {
            this.resultInfo.slice(0, 3).forEach(item => item.hide = true);
        }
        this.editInfo(3, 'pending');
        await this.exeCmd('git tag ' + this.newTag, () => this.editInfo(3, 'success'), () => this.editInfo(3, 'error'));
        this.editInfo(4, 'pending');
        await this.exeCmd('git push origin ' + this.newTag, () => {
            this.editInfo(4, 'success');
            this.postMsg('successTips', true);
        }, () => this.editInfo(4, 'error'));
    }
    
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    updateProgress(info: ProgressInfo[]) {
        const iconMap = {
            error: '✗',
            success: '✓',
            pending: '○',
            notStart: '○',
        };
        const html = `
        ${
            info.map((item, index) => {
                return `<div class="pro-item ${item.status} ${item.hide ? 'hidden' : ''}">
                    <div class="pro-icon">${iconMap[item.status]}</div>
                    <div class="pro-text">${item.text} ${index > 2 ? this.newTag : ''}${item.status === 'pending' ? '...' : ''}</div>
                </div>`;
            }).join('')
        }`;
        this.postMsg('updateProgress', html);
    }
}
