// Tells the tab bar to recount the Films page's to-do list after a rating or vote is saved.
// Client only.

export const TODO_CHANGED_EVENT = 'todo-changed';

export function notifyTodoChanged(): void {
  window.dispatchEvent(new Event(TODO_CHANGED_EVENT));
}
