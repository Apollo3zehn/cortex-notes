import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";

export abstract class CollapsibleTreeItem extends TreeItem {
    abstract getChildren(): Promise<TreeItem[]>;
}

export class GitItem extends TreeItem {
    constructor(
        readonly label: string,
        readonly description: string,
        readonly uri: Uri | undefined,
        readonly tooltip: MarkdownString,
        readonly iconId: string | undefined,
        readonly collapsibleState: TreeItemCollapsibleState) {
        
        super(label, collapsibleState);

        this.description = description;
        this.tooltip = tooltip;

        if (iconId) {
            this.iconPath = new ThemeIcon(iconId);
        }

        this.command = {
            title: "Open",
            command: "vscode.open",
            arguments: uri === undefined ? undefined : [uri]
        };
    }
}