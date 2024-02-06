import { ExtensionContext, Range, TextEditor, window, workspace } from "vscode";
import { LinkType, Page, TodoState, logger } from "../core";
import { doneDecorationType, pageLinkIndicatorDecorationType, pageLinkTitleDecorationType, todoDecorationType } from "../decorationTypes";
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

        const linkIndicatorRanges: Range[] = [];
        const linkTitleRanges: Range[] = [];
        const todoRanges: Range[] = [];
        const doneRanges: Range[] = [];
        const page = getPageByUri(cortex, editor.document.uri);

        if (!page) {
            return;
        }

        for (const block of page.blocks) {

            for (const link of block.links) {

                if (!link.target.uri) {
                    continue;
                }

                let linkIndicatorRange1: Range | undefined;
                let linkIndicatorRange2: Range | undefined;
                let linkTitleRange: Range;

                switch (link.type) {

                    case LinkType.Wikilink:
                        
                        linkIndicatorRange1 = link.range.with(
                            link.range.start,
                            link.range.start.with(undefined, link.range.start.character + 2)
                        );

                        linkIndicatorRange2 = link.range.with(
                            link.range.end.with(undefined, link.range.end.character - 2),
                            link.range.end
                        );
                        
                        linkTitleRange = link.range.with(
                            link.range.start.with(undefined, link.range.start.character + 2),
                            link.range.end.with(undefined, link.range.end.character - 2)
                        );

                        break;

                    case LinkType.Hashtag:

                        linkIndicatorRange1 = link.range.with(
                            link.range.start,
                            link.range.start.with(undefined, link.range.start.character + 1)
                        );
                        
                        linkTitleRange = link.range.with(
                            link.range.start.with(undefined, link.range.start.character + 1),
                            undefined
                        );

                        break;
                                       
                    default:
                        linkTitleRange = link.range;
                }

                if (linkIndicatorRange1) {
                    linkIndicatorRanges.push(linkIndicatorRange1);
                }

                if (linkIndicatorRange2) {
                    linkIndicatorRanges.push(linkIndicatorRange2);
                }

                linkTitleRanges.push(linkTitleRange);
            }

            const allTodoItems = block.links
                .flatMap(link => link.todoItems)
                .concat(block.unassociatedTodoItems);

            for (const todoItem of allTodoItems) {

                switch (todoItem.state) {

                    case TodoState.Todo:
                        todoRanges.push(todoItem.range);
                        break;
                    
                    case TodoState.Done:
                        doneRanges.push(todoItem.range);
                        break;
                }
            }
        }
  
        editor.setDecorations(pageLinkIndicatorDecorationType, linkIndicatorRanges);
        editor.setDecorations(pageLinkTitleDecorationType, linkTitleRanges);
        editor.setDecorations(todoDecorationType, todoRanges);
        editor.setDecorations(doneDecorationType, doneRanges);
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
