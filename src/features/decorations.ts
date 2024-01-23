import { ExtensionContext, Range, TextEditor, window } from "vscode";
import { Page, logger } from "../global";
import { linkDecorationType } from "../decorations";

export async function activate(context: ExtensionContext, cortex: Map<string, Page>) {

    // define update decorations method for links
    const updateLinkDecorations = (editor: TextEditor) => {
  
        logger.appendLine(`Update decorations for document ${editor.document.uri}`);

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
      // TODO: reason for these options?
      null,
      context.subscriptions
    );
}
