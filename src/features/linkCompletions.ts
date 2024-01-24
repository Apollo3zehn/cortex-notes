import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, CompletionList, ExtensionContext, Position, ProviderResult, TextDocument, commands, languages, window } from "vscode";
import { Page, documentSelector } from "../global";

const JUMP_CURSOR_WIKILINK_COMMAND = "cortex-notes.completion-jump-cursor-wikilink";
const _wikilinkRegex = /(?:^|[^\[])\[{2}/;

abstract class LinkCompletionItemProviderBase implements CompletionItemProvider<CompletionItem>
{
    constructor(private cortex: Map<string, Page>) {
        //
    }

    abstract mapPageName(pageName: string): string;

    provideCompletionItems(
        document: TextDocument,
        position: Position,
        token: CancellationToken,
        context: CompletionContext): ProviderResult<CompletionList<CompletionItem> | CompletionItem[]> {

        const cursorPrefix = document
            .lineAt(position)
            .text.substring(0, position.character);
      
        if (!(cursorPrefix.slice(-1) === '#' || cursorPrefix.match(_wikilinkRegex))) {
            return null;
        }
        
        return Array
            .from(this.cortex.values())
            .map(page => page.pageName)
            .sort()
            .map(pageName => {

                const item = new CompletionItem(pageName, CompletionItemKind.Reference);
                item.insertText = this.mapPageName(pageName);

                item.command = {
                    command: 'cortex-notes.completion-jump-cursor-wikilink',
                    title: ''
                };

                return item;
            });
    }
}

class WikilinkCompletionItemProvider extends LinkCompletionItemProviderBase
{
    mapPageName(pageName: string): string {
        return `${pageName}`;
    }
}

class HashTagCompletionItemProvider extends LinkCompletionItemProviderBase
{
    mapPageName(pageName: string): string {
        return `${pageName}`;
    }
}

export function activate(context: ExtensionContext, cortex: Map<string, Page>)
{
    // wikilink
    const wikilinkProvider = new WikilinkCompletionItemProvider(cortex);

    const wikilinkRegistration = languages.registerCompletionItemProvider(
        documentSelector,
        wikilinkProvider,
        '['
    );

    // hashtag
    const hashTagProvider = new HashTagCompletionItemProvider(cortex);

    const hashTagRegistration = languages.registerCompletionItemProvider(
        documentSelector,
        hashTagProvider,
        '#'
    );

    // register disposal
    context.subscriptions.push(wikilinkRegistration, hashTagRegistration);

    // register JUMP_CURSOR_WIKILINK_COMMAND command
    commands.registerCommand(
        JUMP_CURSOR_WIKILINK_COMMAND,
        async () => {
            await commands.executeCommand('cursorMove', {
                to: 'right',
                by: 'character',
                value: 2
            });
        }
    );
}