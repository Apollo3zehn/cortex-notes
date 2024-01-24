import { ExtensionContext, Range, TextEditor, window, workspace } from "vscode";
import { Page, logger } from "../global";
import { linkDecorationType } from "../decorationTypes";
import { isSupportedFile } from "../utils";
import { updateCortexPage } from "../cortex";

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
        const documentUriAsString = editor.document.uri.toString();
        let page: Page | undefined;

        // TODO maybe create a Map<Uri, Page> for simpler lookup (but Uri is not working as key, is it?)?
        for (const current of cortex.values()) {
            if (current.uriAsString === documentUriAsString) {
                page = current;
                break;
            }
        }

        if (!page) {
            return;
        }

        for (const link of page.links) {
            ranges.push(link.range);
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
