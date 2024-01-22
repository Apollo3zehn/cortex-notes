// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Uri, window, workspace } from 'vscode';
import { posix } from 'path';

const logger = window.createOutputChannel('Cortex Notes');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    const fileUris = await workspace.findFiles("**/*.md");
    const cortex = new Map<string, FileMetadata>();
    const linkRegex = /\[{2}(.*?)\]{2}/gm;

    for (const fileUri of fileUris) {

        if (fileUri.scheme !== 'file')
            continue;

        logger.appendLine(`Processing ${fileUri.toString()}`);

        const document = await workspace.openTextDocument(fileUri);
        const text = document.getText();

        const sourcePageName = getPageName(fileUri);
        const metadataSource = GetOrCreateMetadata(cortex, sourcePageName);
        let match: RegExpExecArray | null;

        while ((match = linkRegex.exec(text))) {
            logger.appendLine(`Found link ${match[1]}`);

            const targetPageName = match[1];
            const metadataTarget = GetOrCreateMetadata(cortex, targetPageName);
        }
    }

    let disposable = vscode.commands.registerCommand('cortex-notes.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from cortex-notes!');
    });

    context.subscriptions.push(disposable);
}

function getPageName(uri: Uri): string {
    return changeExtension(posix.basename(uri.fsPath), '*', '')
}

// TODO replace by own implementation
function changeExtension(
    path: string,
    from: string,
    next: string
): string {
    const current = posix.extname(path);

    if ((from === '*' && current !== next) || current === from) {
        path = path.substring(0, path.length - current.length);
        return next ? path + next : path;
    }

    return path;
}

function GetOrCreateMetadata(cortex: Map<string, FileMetadata>, pageName: string, ) {
    let fileMetadata: FileMetadata;

    if (cortex.has(pageName)) {
        fileMetadata = cortex.get(pageName)!;
    }

    else {
        logger.appendLine(`Create page ${pageName}`);
        fileMetadata = new FileMetadata([], []);
        cortex.set(pageName, fileMetadata);
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}

class FileMetadata {
    constructor(
        public readonly links: string[],
        public readonly backlinks: string[]) {
        //
    }
}