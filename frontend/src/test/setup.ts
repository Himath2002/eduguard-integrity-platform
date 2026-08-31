import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const makeStorageMock = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: makeStorageMock(),
});

Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: makeStorageMock(),
});

afterEach(() => {
  cleanup();
});
