import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, TreeItemLabel, Uri } from "vscode";

export abstract class CollapsibleTreeItem extends TreeItem {

    _children: TreeItem[] | undefined;

    constructor(
        readonly label: string | TreeItemLabel,
        readonly collapsibleState: TreeItemCollapsibleState | undefined
    ) {
        super(label, collapsibleState);
    }

    async getChildren(): Promise<TreeItem[]> {

        if (!this._children) {
            this._children = await this.internalGetChildren();
        }

        return this._children;
    }

    public resetChildren() {
        this._children = undefined;
    }

    abstract internalGetChildren(): Promise<TreeItem[]>;
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