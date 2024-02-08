import { ExtensionContext, Position, Range, TextEdit, TextEditor, commands, window } from "vscode";
import { Page, TodoItem, TodoState } from "../core";
import { getPageName, isSupportedFile } from "../utils";

const _insertPositionRegex = /^ *-( *).*$/d;

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const toggleTodoStateCommand = 'cortex-notes.toggle-todo-state';
    const toggleTodoDateCommand = 'cortex-notes.toggle-todo-date';
    
    context.subscriptions.push(
        commands.registerCommand(toggleTodoStateCommand, () => toggleTodoState(cortex)),
        commands.registerCommand(toggleTodoDateCommand, () => toggleTodoDate(cortex)));
}

function toggleTodoState(cortex: Map<string, Page>) {
        
    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    const document = editor.document;
    const todoItem = findTodoItem(cortex, editor);

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

    const document = editor.document;
    const todoItem = findTodoItem(cortex, editor);

    if (todoItem) {
        
        if (todoItem.dateRange) {

            editor.edit(editBuilder => {
                editBuilder.replace(todoItem.dateRange!, '');
            });
        }

        else {

            editor.edit(editBuilder => {

                const lineNumber = editor.selection.active.line;
                const line = document.lineAt(lineNumber);
                const dateString = new Date().toISOString().slice(0, 10);

                editBuilder.replace(line.range, `${line.text.trimEnd()} <${dateString}>`);
            });
        }
    }

    else {

    }

}

function findTodoItem(cortex: Map<string, Page>, editor: TextEditor): TodoItem | undefined {

    const document = editor.document;

    if (!isSupportedFile(document)) {
        return;
    }

    const page = cortex.get(getPageName(document.uri));

    if (!page) {
        return;
    }

    const cursorPosition = editor.selection.active;
    const block = page.blocks.find(block => block.range.contains(cursorPosition));

    if (!block) {
        return;
    }

    const todoItem = block.links
        .flatMap(link => link.todoItems)
        .concat(block.unassociatedTodoItems)
        .find(todoItem => todoItem.range.start.line === cursorPosition.line);
    
    return todoItem;
}