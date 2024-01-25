import { TextDocument, Uri } from "vscode";
import { documentSelector as mdDocumentSelector } from "./core";
import { posix } from "path";

export function getPageName(uri: Uri): string {
    return changeExtension(posix.basename(uri.fsPath), '*', '');
}

// TODO replace by own implementation (credits go to Foam)
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