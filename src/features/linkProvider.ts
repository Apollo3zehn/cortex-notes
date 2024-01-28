import { CancellationToken, DocumentLink, DocumentLinkProvider, ExtensionContext, ProviderResult, TextDocument, languages } from "vscode";
import { Page, documentSelector } from "../core";
import { getPageByUri } from "../cortex";

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {

    const provider = new CortexDocumentLinkProvider(cortex);
    
    context.subscriptions.push(
        languages.registerDocumentLinkProvider(
            documentSelector,
            provider));
}

class CortexDocumentLinkProvider implements DocumentLinkProvider {

    constructor(private cortex: Map<string, Page>) {
        //
    }

    provideDocumentLinks(document: TextDocument, token: CancellationToken): ProviderResult<DocumentLink[]> {

        const documentLinks: DocumentLink[] = [];
        const page = getPageByUri(this.cortex, document.uri);;
    
        if (!page) {
            return;
        }

        for (const block of page.blocks) {

            for (const link of block.links) {

                if (link.target.uri) {
                    const documentLink = new DocumentLink(link.range, link.target.uri);
                    documentLinks.push(documentLink);
                }
            }
        }
    
        return documentLinks;
    }
}