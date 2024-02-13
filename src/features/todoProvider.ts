import { CancellationToken, Event, EventEmitter, ExtensionContext, FileDecoration, FileDecorationProvider, ProviderResult, ThemeColor, ThemeIcon, TreeDataProvider, TreeItem, Uri, commands, window, workspace } from "vscode";
import { Page } from "../core";
import { getPageByUri } from "../cortex";
import { getPageTodoConfig as getTodoConfig } from "../todoConfig";
import { isSupportedFile } from "../utils";
import { GiteaItem } from "./todo-providers/gitea";
import { GitHubItem } from "./todo-providers/github";
import { GitLabIssuesItem, GitLabMergeRequestsItem } from "./todo-providers/gitlab";
import { OutlookItem } from "./todo-providers/mail.outlook";
import { TodoItems } from "./todo-providers/todo";
import { CollapsibleTreeItem } from "./todoTypes";

const _cache = new Map<Page, TreeItem[]>();
const _onDidChangeEmitter = new EventEmitter<void | TreeItem | TreeItem[] | null | undefined>();

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const provider = new TodoTreeDataProvider(context, cortex);

    context.subscriptions.push(
        window.registerTreeDataProvider(
            'cortex-notes.todos',
            provider),
        window.registerFileDecorationProvider(new TodoDecorationProvider()));
    
    const reloadTreeCommand = 'cortex-notes.reload-tree';
    const treeItemCustomActionCommand = 'cortex-notes.tree-item-custom-action';
    
    context.subscriptions.push(

        commands.registerCommand(reloadTreeCommand, item => {
            if (item instanceof CollapsibleTreeItem) {
                item.resetChildren();
                _onDidChangeEmitter.fire();
            }
        }),
    
        commands.registerCommand(treeItemCustomActionCommand, action => {
            if (action) {
                action();
            }
        }),
    
        // update view when document is opened
        window.onDidChangeActiveTextEditor(editor => {
  
            if (!editor) {
                return;
            }

            _onDidChangeEmitter.fire();
        },
            null,
            context.subscriptions
        ),

        // update view when document has changed
        workspace.onDidChangeTextDocument(e => {

            const document = window.activeTextEditor?.document;

            if (!document || !isSupportedFile(document)) {
                return;
            }

            const page = getPageByUri(cortex, document.uri);

            if (!page) {
                return;
            }

            if (_cache.has(page)) {
                    
                const children = _cache.get(page);

                if (!children) {
                    return;
                }

                const todoItemsSet = children
                    .filter(child => child instanceof TodoItems);

                for (const todoItems of todoItemsSet) {
                    /* alternative for casting: https://stackoverflow.com/a/54318054 */
                    (<CollapsibleTreeItem>todoItems).resetChildren();
                }

                return;
            }

            _onDidChangeEmitter.fire();
        },
            null,
            context.subscriptions
        )
    );
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

    constructor(
        context: ExtensionContext,
        readonly cortex: Map<string, Page>
    ) {
        this.onDidChangeTreeData = _onDidChangeEmitter.event;
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

            return new Promise(async resolve => {

                try {

                    const document = window.activeTextEditor?.document;

                    if (!document || !isSupportedFile(document)) {
                        resolve([]);
                        return;
                    }

                    const page = getPageByUri(this.cortex, document.uri);

                    if (!page) {
                        resolve([]);
                        return;
                    }

                    if (_cache.has(page)) {
                        resolve(_cache.get(page));
                        return;
                    }

                    const todoConfig: any = getTodoConfig(document.uri);
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
                            
                            case "outlook":
                                children.push(new OutlookItem(config));
                                break;

                            case "todo-items":
                                children.push(new TodoItems(config, page));
                                break;
                            
                            default:
                                break;
                        }
                    }

                    _cache.set(page, children);

                    resolve(children);
                }
                
                catch (error) {

                    let errorItem = new TreeItem(
                        `Could not process todo config: ${error}`
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