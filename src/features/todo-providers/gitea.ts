import path from "path";
import { TreeItemCollapsibleState, TreeItem, MarkdownString, ThemeIcon } from "vscode";
import { ChildrenCachingTreeItem } from "../todoTypes";

export class GiteaItem extends ChildrenCachingTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? 'More ...'
                : 'Gitea',
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        
        if (!page) {

            this.contextValue = "can-reload";
            this.description = config.repository;

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitea.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitea.svg')
            };
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const owner = encodeURIComponent(this.config.owner);
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open&page=${page}&limit=${GiteaItem.ISSUES_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `token ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const issueItems: TreeItem[] = issues
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.join(' | ');
              
                const item = new TreeItem(issue.title);

                item.description = `#${issue.number} ${description === '' ? '' : "| " + description}`;
                item.tooltip = new MarkdownString(issue.body);
                item.iconPath = new ThemeIcon(issue.pull_request ? 'git-pull-request' : 'circle-outline');

                item.command = {
                    title: "Open",
                    command: "vscode.open",
                    arguments: issue.html_url ? [issue.html_url] : undefined
                };

                return item;
            });
        
        if (issues.length === GiteaItem.ISSUES_PER_PAGE) {
            issueItems.push(new GiteaItem(this.config, page + 1));
        }
        
        return issueItems;
    }
}