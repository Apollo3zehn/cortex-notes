import toml from "toml";
import { workspace, Uri, ExtensionContext } from "vscode";
import { fileExists, getPageName } from "./utils";

let _todoConfig: any;

const _todoConfigFileName = 'cortex-notes.todo.toml';

const _todoConfigFileUri = Uri.joinPath(
    workspace.workspaceFolders![0].uri,
    _todoConfigFileName);

export async function initialize(context: ExtensionContext) {
    
    const todoConfigWatcher = workspace.createFileSystemWatcher(_todoConfigFileUri.fsPath);

    todoConfigWatcher.onDidCreate(loadTodoConfig,
        null,
        context.subscriptions
    );

    todoConfigWatcher.onDidChange(loadTodoConfig,
        null,
        context.subscriptions
    );

    todoConfigWatcher.onDidDelete(
        _ => _todoConfig = undefined,
        null,
        context.subscriptions
    );

    if (await fileExists(_todoConfigFileUri)) {
        await loadTodoConfig();
    }
}

async function loadTodoConfig() {
    const tomlDocument = await workspace.openTextDocument(_todoConfigFileUri);
    _todoConfig = toml.parse(tomlDocument.getText()) as any;
}

export function getPageTodoConfig(
    uri: Uri
) : any[] {
    
    let pageName = getPageName(uri);
    let todoConfig = _todoConfig[pageName];

    if (!todoConfig) {
        todoConfig = [
            {
                type: "todo-items"
            }
        ];
    }

    return todoConfig;
}