import { ExtensionContext, Range, TextEditor, window, workspace } from "vscode";
import { Page, logger } from "../core";
import { linkDecorationType } from "../decorationTypes";
import { isSupportedFile } from "../utils";
import { getPageByUri, updateCortexPage } from "../cortex";

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {

    // define update decorations method for links
    const updateLinkDecorations = (editor: TextEditor | undefined) => {
  
        if (!(editor && isSupportedFile(editor.document))) {
            return;
        }

        logger.appendLine(`Update decorations for ${editor.document.uri}`);

        const ranges: Range[] = [];
        const page = getPageByUri(cortex, editor.document.uri);

        if (!page) {
            return;
        }

        for (const block of page.blocks) {

            for (const link of block.links) {
                ranges.push(link.range);
            }
        }
  
        editor.setDecorations(linkDecorationType, ranges);
    };
    
    // set decorations when document is opened
    window.onDidChangeActiveTextEditor(editor => {
  
        if (!editor) {
            return;
        }

        updateLinkDecorations(editor);
      },
      null,
      context.subscriptions
    );

    // set decorations when document has changed
    workspace.onDidChangeTextDocument(e => {
  
        if (!isSupportedFile(e.document)) {
            return;
        };

        const editor = window.visibleTextEditors.find(
            current => current.document === e.document
        );

        if (!editor) {
            return;
        };

        updateCortexPage(cortex, e.document);
        updateLinkDecorations(editor);
      },
      null,
      context.subscriptions
    );

    updateLinkDecorations(window.activeTextEditor);
}
