export class AppStateStore {
  constructor(initialState = {}) {
    this.state = {
      cfg: null,
      master: null,
      currentTourEntry: null,
      currentTour: null,
      currentScene: null,
      currentSceneId: null,
      platformId: null,
      isLoading: false,
      error: null,
      ...initialState
    };
    this.listeners = new Set();
  }

  getSnapshot() {
    return this.state;
  }

  patch(partialState) {
    this.state = {
      ...this.state,
      ...partialState
    };
    this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
