import * as vscode from 'vscode';
import { Repository } from './type';
import { format } from 'date-fns';

const path = require('path');
const { Uri } = vscode;
import { log, withProgress } from './utils';

let getGitTimes = 0;
export default class TagProvider implements vscode.WebviewViewProvider {

    public static readonly viewType: string = 'gen.tags';
    private _view?: vscode.WebviewView;
    public repo?: Repository;
    public tags: string[] = [];
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
    private initLoading: any;
    private pkgContent: any = {};
    
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
                <div id="repo-list"></div>
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

                    <button class="tags-btn" id="submitBtn">推送 Tag</button>
                </div>
            </div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    async getGitInfo() {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        // if (!gitExtension.isActive) {
        //     await gitExtension.activate?.();
        // }
        const git = gitExtension?.getAPI(1);
        const repo: Repository = git?.repositories[0];
        if (repo) {
            this.repo = repo;
        }
    }

    async init() {
        this.disableSubmit();
        if (this.initLoading) {
            this.initLoading.res();
            this.initLoading = null;
        }
        this.initLoading = await withProgress('Gen Tags: 初始化...');
        const pkgStr = await this.optFile('./package.json') || '';
        try {
            this.pkgContent = JSON.parse(pkgStr);
            const prefix = this.pkgContent['tagPrefix'] || [];
            this.postMsg('prefixOptions', prefix);
        } catch (e) {
            log('package.json 解析失败');
        }

        const fn = (res: any) => {
            getGitTimes++;
            if (getGitTimes > 5) {
                this.initLoading.res();
                log('获取 git 信息失败');
                res();
            } else {
                this.getGitInfo();
                if (!this.repo) {
                    setTimeout(() => fn(res), 1000);
                } else {
                    res();
                }
            }
        };
        await new Promise(res => fn(res));

        if (!this.repo) {
            this.initLoading.res();
            return;
        }
        await this.repo.fetch().then(() => {
            this.repo?.getRefs({}).then(res => {
                this.tags = res
                    // type: 2 表示 tag
                    .filter(item => item.type === 2 && item.name !== undefined)
                    .map(item => item.name as string);
                    this.initLoading.res();
                this.genTag();
            });
        }).catch(() => {
            this.initLoading.res();
            log('获取 tags 失败');
        });
        this.disableSubmit(false);
    }

    postMsg(type: string, data: any) {
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
    
    async optFile(filePath: string, content?: string) {
        const fullPath = this.getWorkspaceFilePath(filePath);
        const fileUri = Uri.file(fullPath);
        try {
            if (content) {
                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));
            } else {
                const byteArray = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = Buffer.from(byteArray).toString('utf8');
                return fileContent;
            }
        } catch (err) {
            log(`${filePath}: ${err}`);
            throw err;
        }
    }
    
    resolveTags(tags: string[]) {
        return tags.map(item => {
            const match = item.match(/\d+\.\d+\.\d+/);
            return match ? match[0] : '';
        }).filter(item => item !== '');
    }
    
    latestTag(data: string[]) {
        const tags = this.resolveTags(data);
        const tag = tags.sort((a, b) => {
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
        let version = this.latestTag(this.tags);
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
    
    async handleSubmit() {
        this.disableSubmit();
        const p = await withProgress('Gen Tags: 推送 Tag...');
        try {
            if (this.formData.editPkg) {
                this.pkgContent.tag = this.newTag;
                this.optFile('./package.json', JSON.stringify(this.pkgContent, null, 4)).catch(() => {
                    throw new Error('package.json#tag 设置失败');
                });
                const fullPath = this.getWorkspaceFilePath('package.json');
                await this.repo?.add([fullPath]).catch(() => {
                    throw new Error('提交 package.json 失败');
                });
                await this.repo?.commit('build: update package.json#tag').catch(() => {
                    throw new Error('提交 package.json 失败');
                });
            }
            await this.repo?.tag(this.newTag, 'HEAD').catch(() => {
                throw new Error('创建 Tag 失败');
            });
            await this.repo?.push('origin', this.newTag).catch(() => {
                throw new Error('推送 Tag 失败');
            });
            p.res();
            this.init();
            this.disableSubmit(false);
        } catch (e) {
            log((e as Error).message || '推送失败');
            p.res();
            this.disableSubmit(false);
        }
    }
    
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
