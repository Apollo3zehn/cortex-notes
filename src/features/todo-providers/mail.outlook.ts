import { InteractiveBrowserCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { Message } from "@microsoft/microsoft-graph-types";
import path from "path";
import { MarkdownString, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { CollapsibleTreeItem, TodoTreeItem } from "../todoTypes";

export class OutlookItem extends CollapsibleTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;
    readonly _graphClient: Client;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? "More ..."
                : `Outlook: ${config.repository}`,
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitea.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitea.svg')
            };
        }

        // https://learn.microsoft.com/en-us/graph/sdks/choose-authentication-providers?tabs=typescript#device-code-provider
        const credential = new InteractiveBrowserCredential({
            tenantId: 'common',
            clientId: 'f470bc86-5748-46ef-8d92-450964420fb9'
          });
          
        const authProvider = new TokenCredentialAuthenticationProvider(credential, {
            scopes: ['Mail.ReadWrite'],
        });
          
        this._graphClient = Client.initWithMiddleware({ authProvider: authProvider });
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        try {

            // const page = this.page ? this.page : 1;
            // const owner = encodeURIComponent(this.config.owner);
            // const repository = encodeURIComponent(this.config.repository);
            // const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open&page=${page}&limit=${OutlookItem.ISSUES_PER_PAGE}`;

            const messages: Message[] = (await this._graphClient.api('/me/mailFolders/inbox/messages').top(10).get()).value;

            const todoItems = messages.map(message => {

                const todoItem = new TodoTreeItem(
                    message.subject ?? '',
                    message.bodyPreview ?? '',
                    message.webLink ? Uri.parse(message.webLink) : undefined,
                    undefined,
                    new MarkdownString('to be rendered'),
                    message.attachments ? 'mail' : 'wrench',
                    TreeItemCollapsibleState.None,
                    undefined,
                    undefined);
                
                return todoItem;
            });
                
            return todoItems;
        } catch (error) {
            //
            const a = 1;
        }

        return [];
    }
}