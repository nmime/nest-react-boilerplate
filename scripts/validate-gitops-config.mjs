#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const manifestPath = new URL(
  "../deploy/argocd/application.yaml",
  import.meta.url,
);
assert.ok(
  existsSync(manifestPath),
  "GitOps/Argo validation requires deploy/argocd/application.yaml when gitops mode is selected.",
);

const manifest = readFileSync(manifestPath, "utf8");
const has = (needle, label = needle) =>
  assert.ok(
    manifest.includes(needle),
    `Missing expected GitOps config: ${label}`,
  );

has("apiVersion: argoproj.io/v1alpha1", "Argo CD Application apiVersion");
has("kind: Application", "Argo CD Application kind");
has("namespace: argocd", "Argo CD namespace");
has("path: .helm", "GitOps source points at the Helm chart");
has("targetRevision:", "GitOps source declares a target revision");
has("destination:", "GitOps destination block");
has("syncPolicy:", "GitOps sync policy block");
assert.ok(
  !/repoURL:\s*["']?https:\/\/github\.com\/example\//u.test(manifest),
  "GitOps Application repoURL must not use the example placeholder repository.",
);

console.log("gitops static assertions passed");
