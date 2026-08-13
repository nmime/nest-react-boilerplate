import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';

/**
 * Per-scenario state a product contributes, declared from the product's own file:
 *
 * ```ts
 * declare module '<...>/src/support/world.ts' {
 *   interface AcceptanceWorldExtensions {
 *     listing: Listing | undefined;
 *   }
 * }
 * ```
 *
 * Cucumber allows exactly one world constructor, and `cucumber.config.ts` imports this directory by
 * glob, so subclassing plus a second `setWorldConstructor` resolves by whichever file the glob
 * happens to visit last. Merging an interface into the class instead keeps one constructor, gives
 * product fields full type-checking, and leaves this file untouched by every product that has
 * scenario state -- which is all of them.
 */
// Empty on purpose: an interface with no members is the only shape a product can augment. The
// merge into the class is equally deliberate, and it carries the hazard the rule is named for --
// the type promises fields no constructor assigns. Declare product fields as `| undefined` so the
// type says what a step reading before a step writing actually gets, exactly as the boilerplate's
// own optional fields below do.
/* eslint-disable @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
export interface AcceptanceWorldExtensions {}

export interface AcceptanceWorld extends AcceptanceWorldExtensions {}

export class AcceptanceWorld extends World {
  /* eslint-enable @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging */
  claim: unknown;
  normalizedRoles: string[] = [];
  permissions: string[] = [];
  requestId: string | undefined;
  occurrenceUri: string | undefined;
  occurrenceError: unknown;
  notificationChannel: string | undefined;
  externalDelivery: boolean | undefined;
  assuranceExitCode: number | null | undefined;
  releaseWorkflow: string | undefined;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(AcceptanceWorld);
