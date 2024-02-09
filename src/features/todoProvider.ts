import { CancellationToken, Event, EventEmitter, ExtensionContext, FileDecoration, FileDecorationProvider, ProviderResult, ThemeColor, ThemeIcon, TreeDataProvider, TreeItem, Uri, window, workspace } from "vscode";
import { Page } from "../core";
import { getPageByUri } from "../cortex";
import { isSupportedFile } from "../utils";
import { GiteaItem } from "./todo-providers/gitea";
import { GitHubItem } from "./todo-providers/github";
import { GitLabIssuesItem, GitLabMergeRequestsItem } from "./todo-providers/gitlab";
import { TodoItems } from "./todo-providers/todo";
import { CollapsibleTreeItem } from "./todoTypes";
import { getPageTodoConfig as getTodoConfig } from "../todoConfig";

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const provider = new TodoTreeDataProvider(context, cortex);

    context.subscriptions.push(
        window.registerTreeDataProvider(
            'cortex-notes.todos',
            provider),
        window.registerFileDecorationProvider(new TodoDecorationProvider()));
}

class TodoDecorationProvider implements FileDecorationProvider {
    provideFileDecoration(uri: Uri, token: CancellationToken): ProviderResult<FileDecoration> {
        
        // https://code.visualstudio.com/api/references/theme-color#lists-and-trees
        if (uri.scheme === 'cortex-notes') {
            return {
                color: new ThemeColor(uri.authority)
            };
        }

        return undefined;
    }
}

class TodoTreeDataProvider implements TreeDataProvider<TreeItem> {
    
    onDidChangeTreeData?: Event<void | TreeItem | TreeItem[] | null | undefined> | undefined;

    _onDidChangeEmitter = new EventEmitter<void | TreeItem | TreeItem[] | null | undefined>();
    _children: TreeItem[] | undefined;

    constructor(
        context: ExtensionContext,
        readonly cortex: Map<string, Page>
    ) {
        this.onDidChangeTreeData = this._onDidChangeEmitter.event;
      
        // update view when document is opened
        window.onDidChangeActiveTextEditor(editor => {
  
                if (!editor) {
                    return;
                }

                this._children = undefined;
                this._onDidChangeEmitter.fire();
            },
            null,
            context.subscriptions
        );

        // update view when document has changed
        workspace.onDidChangeTextDocument(e => {

                if (this._children) {

                    const todoItemsSet = this._children
                        .filter(child => child instanceof TodoItems);

                    for (const todoItems of todoItemsSet) {
                        /* alternative to cast: https://stackoverflow.com/a/54318054 */
                        (<TodoItems>todoItems).resetChildren();
                    }
                }

                this._onDidChangeEmitter.fire();
            },
            null,
            context.subscriptions
        );
    }

    getTreeItem(element: TreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: TreeItem | undefined): ProviderResult<TreeItem[]> {

        if (element) {

            if (element instanceof CollapsibleTreeItem) {
                return element.getChildren();
            }

            else {
                throw new Error("Unsupported tree item.");
            }
        }

        else {

            if (this._children) {
                return this._children;
            }

            const document = window.activeTextEditor?.document;

            if (!document || !isSupportedFile(document)) {
                return [];
            }

            return new Promise(async resolve => {

                try {

                    let todoConfig: any = getTodoConfig(document.uri);

                    const children: TreeItem[] = [];
        
                    for (const config of todoConfig) {

                        switch ((<any>config).type) {

                            case "github":
                                children.push(new GitHubItem(config));
                                break;
                        
                            case "gitlab-issues":
                                children.push(new GitLabIssuesItem(config));
                                break;
                            
                            case "gitlab-merge-requests":
                                children.push(new GitLabMergeRequestsItem(config));
                                break;
                            
                            case "gitea-issues":
                                children.push(new GiteaItem(config));
                                break;

                            case "todo-items":
                                const page = getPageByUri(this.cortex, document.uri);

                                if (page) {
                                    children.push(new TodoItems(config, page));
                                }

                                break;
                            
                            default:
                                break;
                        }
                    }

                    this._children = children;

                    resolve(children);
                }
                
                catch (error) {

                    let errorItem = new TreeItem(
                        `Could process todo config: ${error}`
                    );

                    errorItem.iconPath = new ThemeIcon("error");

                    resolve([
                        errorItem
                    ]);
                }
            });
        }
    }
}