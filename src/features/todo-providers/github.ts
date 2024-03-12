import { components } from "@octokit/openapi-types";
import { OctokitResponse } from "@octokit/types";
import { Octokit } from "octokit";
import path from "path";
import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { ChildrenCachingTreeItem } from "../todoTypes";

type IssueItem = components["schemas"]["issue"];

export class GitHubItem extends ChildrenCachingTreeItem {

    static readonly ISSUES_PER_PAGE: number = 15;

    constructor(
        config: any
    );

    constructor(
        config: any,
        issuesIterator?: AsyncIterator<OctokitResponse<IssueItem[]>, void, unknown>
    );

    constructor(
        readonly config: any,
        private issuesIterator?: AsyncIterator<OctokitResponse<IssueItem[]>, void, unknown>
    ) {
        super(
            issuesIterator
                ? 'More ...'
                : 'GitHub',
            
            config.collapsed === 'true' || issuesIterator
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        
        if (!issuesIterator) {
            
            this.contextValue = "can-reload";
            this.description = config.repository;

            const octokit = new Octokit({
                auth: this.config.api_key
            });

            const issuesIterator = octokit.paginate.iterator(
                octokit.rest.issues.listForRepo,
                {
                    owner: this.config.owner,
                    repo: this.config.repository,
                    per_page: GitHubItem.ISSUES_PER_PAGE
                }
            );

            this.issuesIterator = GitHubItem.Iterate(issuesIterator);

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'github.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'github.svg')
            };
        }
    }

    static async * Iterate(iterator: any) {
        for await (const item of iterator) {
            yield item;
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {
        
        const iteratorResult = await this.issuesIterator!.next();

        if (iteratorResult.done) {
            return [];
        }

        const issues = iteratorResult.value.data;

        const issueItems: TreeItem[] = issues
            .map(issue => {

                const description = issue.labels.length === 0
                    ? ''
                    : issue.labels.map(label => {

                        if (typeof label === "string") {
                            return label;
                        }

                        else {
                            return label.name;
                        }
                        
                    }).join(' | ');

                const item = new TreeItem(issue.title);
                    
                item.description = `#${issue.number} ${description === '' ? '' : "| " + description}`;
                item.tooltip = new MarkdownString(issue.body ?? undefined);
                item.iconPath = new ThemeIcon(issue.pull_request ? 'git-pull-request' : 'circle-outline');
        
                if (issue.html_url) {
                    this.command = {
                        title: "Open",
                        command: "vscode.open",
                        arguments: [issue.html_url]
                    };
                }

                return item;
            });
        
        if (issues.length === GitHubItem.ISSUES_PER_PAGE) {
            issueItems.push(new GitHubItem(this.config, this.issuesIterator));
        }

        return issueItems;
    }
}