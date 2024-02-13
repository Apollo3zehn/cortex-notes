import { ExtensionContext, Position, Range, TreeItem, Uri, WorkspaceEdit, commands, window, workspace } from "vscode";
import { Page, Priority, TodoItem, TodoState } from "../core";
import { isSupportedFile } from "../utils";
import { getPageByUri } from "../cortex";
import { TodoTreeItem } from "./todoTypes";

const _insertPositionRegex = /^ *-( *).*$/d;

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    // toggle state and date
    const toggleTodoStateCommand = 'cortex-notes.toggle-todo-state';
    const toggleTodoDateCommand = 'cortex-notes.toggle-todo-date';

    context.subscriptions.push(
        commands.registerCommand(toggleTodoStateCommand, () => toggleTodoState(cortex)),
        commands.registerCommand(toggleTodoDateCommand, () => toggleTodoDate(cortex)));

    // priority
    const priorityUpCommand = 'cortex-notes.priority-up';
    const priorityDownCommand = 'cortex-notes.priority-down';
    const priorityACommand = 'cortex-notes.priority-a';
    const priorityBCommand = 'cortex-notes.priority-b';
    const priorityCCommand = 'cortex-notes.priority-c';
    const priorityResetCommand = 'cortex-notes.priority-reset';
    
    context.subscriptions.push(
        commands.registerCommand(priorityUpCommand, () => priorityUpDown(cortex, true)),
        commands.registerCommand(priorityDownCommand, () => priorityUpDown(cortex, false)),
        commands.registerCommand(priorityResetCommand, treeItem => setPriorityForTreeItem(treeItem, Priority.Reset)),
        commands.registerCommand(priorityACommand, treeItem => setPriorityForTreeItem(treeItem, Priority.A)),
        commands.registerCommand(priorityBCommand, treeItem => setPriorityForTreeItem(treeItem, Priority.B)),
        commands.registerCommand(priorityCCommand, treeItem => setPriorityForTreeItem(treeItem, Priority.C)));
}

function toggleTodoState(cortex: Map<string, Page>) {
        
    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    if (!isSupportedFile(editor.document)) {
        return;
    }

    const document = editor.document;
    const cursorPosition = editor.selection.active;
    const todoItem = findTodoItem(cortex, editor.document.uri, cursorPosition);

    if (todoItem) {
        
        switch (todoItem.state) {

            case TodoState.Todo:

                editor.edit(editBuilder => {
                    editBuilder.replace(todoItem.range, 'DONE');
                });
                
                /* must be extra '' to void "overlapping ranges are not allowed" error */
                editor.edit(editBuilder => {

                    if (todoItem.dateRange) {
                        const dateString = new Date().toISOString().slice(0, 10);
    
                        editBuilder.replace(todoItem.dateRange!, `<${dateString}>`);
                    }
                    
                    else {
    
                        const lineNumber = editor.selection.active.line;
                        const line = document.lineAt(lineNumber);
                        const dateString = new Date().toISOString().slice(0, 10);
    
                        editBuilder.replace(line.range, `${line.text.trimEnd()} <${dateString}>`);
                    }
                });

                break;
        
            case TodoState.Done:

                const movedStart = todoItem.range.start
                    .with(undefined, todoItem.range.start.character - 1);
                
                const expandedRange = todoItem.range.with(movedStart);
                
                editor.edit(editBuilder => {

                    editBuilder.replace(expandedRange, '');

                    if (todoItem.dateRange) {
                        editBuilder.replace(todoItem.dateRange!, '');
                    }
                });
                
                break;
            
            default:
                return;
        }
    }

    else {

        const document = editor.document;
        const cursorPosition = editor.selection.active;
        const line = document.lineAt(cursorPosition.line);
        
        if (line.isEmptyOrWhitespace) {

            editor.edit(editBuilder => {
                editBuilder.replace(line.range, "- TODO ");
            });
        }
        
        else {

            const insertPositionMatch = line.text.match(_insertPositionRegex);

            if (!insertPositionMatch) {
                return;
            }

            const offset = document.offsetAt(new Position(
                cursorPosition.line,
                0
            ));
            
            const indices = insertPositionMatch.indices![1];
            const startPos = document.positionAt(offset + indices[0]);
            const endPos = document.positionAt(offset + indices[1]);
            const range = new Range(startPos, endPos);

            editor.edit(editBuilder => {
                editBuilder.replace(range, " TODO ");
            });
        }
    }
};

function toggleTodoDate(cortex: Map<string, Page>) {

    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    if (!isSupportedFile(editor.document)) {
        return;
    }

    const cursorPosition = editor.selection.active;
    const todoItem = findTodoItem(cortex, editor.document.uri, cursorPosition);
    const document = editor.document;

    if (todoItem) {
        
        if (todoItem.dateRange) {

            editor.edit(editBuilder => {
                editBuilder.replace(todoItem.dateRange!, '');
            });
        }

        else {

            editor.edit(editBuilder => {

                const line = document.lineAt(todoItem.range.start.line);
                const dateString = new Date().toISOString().slice(0, 10);

                editBuilder.replace(line.range, `${line.text.trimEnd()} <${dateString}>`);
            });
        }
    }
}

async function priorityUpDown(cortex: Map<string, Page>, up: boolean) {

    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    if (!isSupportedFile(editor.document)) {
        return;
    }

    const cursorPosition = editor.selection.active;
    const todoItem = findTodoItem(cortex, editor.document.uri, cursorPosition);

    if (!todoItem) {
        return;
    }

    const modifier = up
            ? -1
            : 1;

    let priority: Priority | undefined = undefined;
    
    if (todoItem.priority) {
        priority = (todoItem.priority + modifier) % 4;
    }

    else {
        priority = up
            ? Priority.C
            : Priority.A;
    }

    await setPriority(todoItem, priority, editor.document.uri);
}

async function setPriorityForTreeItem(
    treeItem: TreeItem | undefined,
    priority: Priority) {
    
    if (!(
        treeItem instanceof TodoTreeItem &&
        treeItem.cortexContext instanceof Array &&
        treeItem.cortexContext.length === 2 &&
        treeItem.cortexContext[0] instanceof Uri &&
        treeItem.cortexContext[1] instanceof TodoItem)) {
        
        return;
    }
    
    const pageUri = treeItem.cortexContext[0];
    const todoItem = treeItem.cortexContext[1];

    await setPriority(todoItem, priority, pageUri);
}

async function setPriority(
    todoItem: TodoItem,
    priority: Priority,
    pageUri: Uri) {
    
    const workspaceEdit = new WorkspaceEdit();
    
    if (todoItem.priorityRange) {
        
        if (priority) {
            workspaceEdit.replace(pageUri, todoItem.priorityRange!, `[#${Priority[priority]}]`);
        }

        else {

            const document = await workspace.openTextDocument(pageUri);
            const line = document.lineAt(todoItem.priorityRange!.start.line);

            const prefix = line.text
                .substring(0, todoItem.priorityRange!.start.character)
                .trimEnd();
            
            const suffix = line.text
                .substring(todoItem.priorityRange!.end.character)
                .trimStart();

            const lineWithoutPriority = [prefix, suffix].join(' ');
            
            workspaceEdit.replace(pageUri, line.range, lineWithoutPriority);
        }
    }

    else {

        const range = new Range(todoItem.range.end, todoItem.range.end);

        if (priority) {
            workspaceEdit.replace(pageUri, range, ` [#${Priority[priority]}]`);
        }
    }

    await workspace.applyEdit(workspaceEdit);
}

function findTodoItem(
    cortex: Map<string, Page>,
    pageUri: Uri,
    position: Position): TodoItem | undefined {

    const page = getPageByUri(cortex, pageUri);

    if (!page) {
        return;
    }

    const block = page.blocks.find(block => block.range.contains(position));

    if (!block) {
        return;
    }

    const todoItem = block.links
        .flatMap(link => link.todoItems)
        .concat(block.unassociatedTodoItems)
        .find(todoItem => todoItem.range.start.line === position.line);
    
    return todoItem;
}