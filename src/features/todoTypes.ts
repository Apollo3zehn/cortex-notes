import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, TreeItemLabel, Uri } from "vscode";

export abstract class CollapsibleTreeItem extends TreeItem {

    _children: TreeItem[] | undefined;

    constructor(
        label: string | TreeItemLabel,
        collapsibleState: TreeItemCollapsibleState | undefined
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

export class TodoTreeItem extends TreeItem {
    
    constructor(
        label: string,
        description: string,
        uri: Uri | undefined,
        decorationUri: Uri | undefined,
        tooltip: MarkdownString,
        iconId: string | undefined,
        collapsibleState: TreeItemCollapsibleState,
        context?: string | undefined) {
        
        super(label, collapsibleState);
        
        this.description = description;
        this.tooltip = tooltip;
        this.resourceUri = decorationUri;
        this.contextValue = context;

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