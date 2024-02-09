import { ExtensionContext, workspace } from 'vscode';
import { logger } from './core';
import { buildCortex, deleteCortexPageOrMakeTransientByUri } from './cortex';
import { activate as activateBacklinks } from './features/backlinks';
import { activate as activateCommands } from './features/commands';
import { activate as activateDecorations } from './features/decorations';
import { activate as activateCompletions } from './features/linkCompletions';
import { activate as activateLinks } from './features/linkProvider';
import { activate as activateTodo } from './features/todoProvider';
import { initialize as initializeTodoConfig } from './todoConfig';

export async function activate(context: ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    await initializeTodoConfig(context);
    const cortex = await buildCortex(context);

    activateDecorations(context, cortex);
    activateLinks(context, cortex);
    activateCompletions(context, cortex);
    activateBacklinks(context, cortex);
    activateTodo(context, cortex);
    activateCommands(context, cortex);

    // update on delete
    const watcher = workspace.createFileSystemWatcher('**/*');

    watcher.onDidDelete(uri => deleteCortexPageOrMakeTransientByUri(cortex, uri),
        null,
        context.subscriptions);
}

export function deactivate() {}