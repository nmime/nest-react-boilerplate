// The shared permission and role identifiers plus the claim normalizer stay resolvable from this
// boundary, so a new permission upstream needs no edit here.
export * from '@app/common-authz';
export * from './access-policy';
