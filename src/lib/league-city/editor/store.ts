// A tiny external store around the editor reducer, so the autosave queue can
// read the latest state synchronously and React subscribes with
// useSyncExternalStore.

import { editorReducer, type EditorAction, type EditorState } from "./state";

export interface EditorStore {
  getState(): EditorState;
  dispatch(action: EditorAction): void;
  subscribe(listener: () => void): () => void;
}

export function createEditorStore(initial: EditorState): EditorStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = editorReducer(state, action);
      if (next === state) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
