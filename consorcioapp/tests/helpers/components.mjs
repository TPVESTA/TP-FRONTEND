import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3001' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement,
  FormData: dom.window.FormData, Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
export const { render, fireEvent, within, cleanup } = await import('@testing-library/react/pure.js');
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));

// React, DOM, API y lógica del proyecto reales; se puede reemplazar el contexto
// de sesión de Next sin tener que ejecutar el servidor para cada prueba.
export function loadComponent(component, mocks = {}) {
  return loadModule(component, mocks).default;
}

// Igual que loadComponent, pero devuelve todos los exports (por ejemplo, los hooks del shell).
export function loadModule(component, mocks = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = ['.ts', '.tsx'].map(extension => base + extension).find(candidate => fs.existsSync(candidate));
      if (!resolved) throw new Error('Módulo de prueba no encontrado: ' + name);
      return load(resolved);
    };
    vm.runInThisContext(`(function(require, module, exports) {\n${source}\n})`, { filename })(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(path.join(root, component));
}
