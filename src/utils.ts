import { TextDocument } from "vscode";
import { documentSelector as mdDocumentSelector } from "./global";

export function isSupportedFile(document: TextDocument): boolean {

    for (const selector of mdDocumentSelector) {

        if (!(
            document.languageId == selector.language &&
            document.uri.scheme === selector.scheme)) {
            return false;
        }
    }

    return true;
}