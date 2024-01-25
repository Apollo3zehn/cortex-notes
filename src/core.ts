import { Range, Uri, window } from "vscode";

export const logger = window.createOutputChannel('Cortex Notes');

export const documentSelector = [
    { language: 'markdown', scheme: 'file' }
];

export class Page {
    constructor(
        public readonly name: string,
        public uri: Uri | undefined,
        public uriAsString: string | undefined,
        public readonly links: PageLink[],
        public readonly backlinks: PageLink[]) {
        //
    }
}

export class PageLink {
    constructor(
        public readonly source: Page,
        public readonly target: Page,
        public readonly range: Range,
        public readonly type: LinkType) {
        //
    }
}

export enum LinkType {
    Wikilink,
    Hashtag,
    Todo
}