import path from "path";
import { TreeItemCollapsibleState, TreeItem, MarkdownString, ThemeIcon } from "vscode";
import { ChildrenCachingTreeItem } from "../todoTypes";

export class GitLabIssuesItem extends ChildrenCachingTreeItem {

    static readonly ISSUES_PER_PAGE: number = 15;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? 'More ...'
                : 'GitLab Issues',
                       
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {

            this.description = config.repository;
            this.contextValue = "can-reload";

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
            };
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/issues?assignee_username=${this.config.assignee_username}&state=opened&page=${page}&per_page=${GitLabIssuesItem.ISSUES_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const issueItems: TreeItem[] = issues
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.map(label => label).join(' | ');
              
                const item = new TreeItem(issue.title);

                item.description = `#${issue.iid} ${description === '' ? '' : "| " + description}`;
                item.tooltip = new MarkdownString(issue.description);
                item.iconPath = new ThemeIcon('circle-outline');
        
                if (issue.web_url) {
                    this.command = {
                        title: "Open",
                        command: "vscode.open",
                        arguments: [issue.web_url]
                    };
                }
        
                return item;
            });
        
        if (issues.length === GitLabIssuesItem.ISSUES_PER_PAGE) {
            issueItems.push(new GitLabIssuesItem(this.config, page + 1));
        }
        
        return issueItems;
    }
}

export class GitLabMergeRequestsItem extends ChildrenCachingTreeItem {

    static readonly MERGE_REQUESTS_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? 'More ...'
                : 'GitLab MRs',
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {

            this.description = config.repository;
            this.contextValue = "can-reload";

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
            };
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/merge_requests?author_username=${this.config.author_username}&state=opened&page=${page}&per_page=${GitLabMergeRequestsItem.MERGE_REQUESTS_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const mergeRequests = (await response.json()) as any[];
        
        const todoItems: TreeItem[] = mergeRequests
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.map(label => label).join(' | ');
              
                const item = new TreeItem(issue.title);

                item.description = `!${issue.iid} ${description === '' ? '' : "| " + description}`;
                item.tooltip = new MarkdownString(issue.description);
                item.iconPath = new ThemeIcon('git-pull-request');
                
                if (issue.web_url) {
                    this.command = {
                        title: "Open",
                        command: "vscode.open",
                        arguments: [issue.web_url]
                    };
                }
        
                return item;
            });
        
        if (mergeRequests.length === GitLabMergeRequestsItem.MERGE_REQUESTS_PER_PAGE) {
            todoItems.push(new GitLabMergeRequestsItem(this.config, page + 1));
        }
        
        return todoItems;
    }
}