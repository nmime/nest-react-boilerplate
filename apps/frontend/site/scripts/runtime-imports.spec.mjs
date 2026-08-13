// @requirements REQ-FRONTEND-SSR-007
import { describe, expect, it } from 'vitest';

import { collectRuntimePackages } from './runtime-imports.mjs';

describe('SSR runtime import inventory', () => {
  // Rolldown keeps an external package that a bundled module only imported for its side effects,
  // and it writes that import without a `from` clause. The SSR bundle still needs the package at
  // runtime, so a scan that reads only `from` clauses reports a clean build that cannot boot.
  it('reports a package imported only for its side effects', () => {
    expect(collectRuntimePackages('import "openapi-fetch";')).toEqual(['openapi-fetch']);
  });

  it('reports packages behind named, default, and re-exported bindings', () => {
    const output = [
      'import { QueryClient } from "@tanstack/react-query";',
      'import fastify from "fastify";',
      'export * from "mobx";',
    ].join('\n');

    expect(collectRuntimePackages(output)).toEqual(['@tanstack/react-query', 'fastify', 'mobx']);
  });

  it('reports packages behind deferred imports', () => {
    expect(collectRuntimePackages('const mod = await import("vike-react");')).toEqual(['vike-react']);
  });

  // The installed package is what has to be declared, so a deep import counts as its package.
  it('reduces a deep import to the package that has to be installed', () => {
    const output = ['import "react-dom/server";', 'import "@fastify/static/lib/index.js";'].join('\n');

    expect(collectRuntimePackages(output)).toEqual(['@fastify/static', 'react-dom']);
  });

  // Relative specifiers resolve inside the bundle and `node:` specifiers resolve in the runtime,
  // so neither is something the app has to declare.
  it('ignores bundled and built-in specifiers', () => {
    const output = ['import "./chunk-D7D4PA-g.js";', 'import { readFileSync } from "node:fs";'].join('\n');

    expect(collectRuntimePackages(output)).toEqual([]);
  });

  it('reports each package once however often it is imported', () => {
    const output = ['import "react";', 'import { useState } from "react";', 'import "react/jsx-runtime";'].join('\n');

    expect(collectRuntimePackages(output)).toEqual(['react']);
  });
});
