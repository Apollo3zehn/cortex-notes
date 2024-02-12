import path from "path";
import { TreeItemCollapsibleState, TreeItem, window } from "vscode";
import { CollapsibleTreeItem } from "../todoTypes";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { DeviceCodeCredential } from "@azure/identity";

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
        const credential = new DeviceCodeCredential({
            tenantId: '6b0a5518-c0bc-49e3-b0a6-0b9a63f31fc1',
            clientId: 'f470bc86-5748-46ef-8d92-450964420fb9',
            userPromptCallback: async info => {

                const deviceCode = await window.showInputBox({
                    placeHolder: "device code",
                    prompt: info.message
                });

                return deviceCode;
            },
          });
          
        const authProvider = new TokenCredentialAuthenticationProvider(credential, {
            scopes: ['Mail.ReadWrite'],
        });
          
        this._graphClient = Client.initWithMiddleware({ authProvider: authProvider });
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        try {
            const messages = await this._graphClient.api('/me/messages').top(10).get();
        } catch (error) {
            const c = 1;
        }

        const page = this.page ? this.page : 1;
        const owner = encodeURIComponent(this.config.owner);
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open&page=${page}&limit=${OutlookItem.ISSUES_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `token ${this.config.api_key}`
            }
        });

        return [];
    }
}