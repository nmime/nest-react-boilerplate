// @requirements REQ-ASSURANCE-INVENTORY-004
//
// A compile-only proof that a product can add scenario state without editing the shared World.
// It is deliberately outside `src/`, which is what the Cucumber import glob and the step-definition
// loader read: this file must be type-checked and must never be loaded as a step definition.
//
// If this stops compiling, the seam is gone and the next product will do what the last one did --
// paste its fields into src/support/world.ts and own a permanent conflict with upstream.
import type { AcceptanceWorld } from '../src/support/world.ts';

declare module '../src/support/world.ts' {
  interface AcceptanceWorldExtensions {
    productListing: { id: string; price: number } | undefined;
  }
}

export function readsProductState(this: AcceptanceWorld): string | undefined {
  this.productListing = { id: 'listing-1', price: 100 };

  // The boilerplate's own fields stay reachable from the same `this`.
  return this.productListing.id === '' ? this.requestId : this.productListing.id;
}
