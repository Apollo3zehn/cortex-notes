import { FileType, TextDocument, Uri, workspace } from "vscode";
import { documentSelector as mdDocumentSelector } from "./core";
import { posix } from "path";

export function getPageName(uri: Uri): string {
    return changeExtension(posix.basename(uri.fsPath), '*', '');
}

// TODO replace by own implementation (credits go to Foam)
// maybe here is something useful? https://github.com/microsoft/vscode-extension-samples/blob/main/fsconsumer-sample/src/extension.ts
export function changeExtension(
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

export function isSupportedFile(document: TextDocument): boolean {

    for (const selector of mdDocumentSelector) {

        if (!(
            document.languageId === selector.language &&
            document.uri.scheme === selector.scheme)) {
            return false;
        }
    }

    return true;
}

export function getOpenFileCommandUri(uri: Uri): Uri {
    return Uri.parse(
        `command:vscode.open?${encodeURIComponent(JSON.stringify(uri))}`
    );
}

export async function fileExists(uri: Uri): Promise<boolean> {
    try {
        const fileStat = await workspace.fs.stat(uri);
        return fileStat.type === FileType.File;
    } catch (e) {
        return false;
    }
}