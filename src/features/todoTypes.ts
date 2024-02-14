import { TreeItem, TreeItemCollapsibleState, TreeItemLabel } from "vscode";

export abstract class ChildrenCachingTreeItem extends TreeItem {

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

export class ContextTreeItem extends TreeItem {
    
    constructor(
        label: string,
        public readonly cortexContext?: any) {
        
        super(label);
    }
}