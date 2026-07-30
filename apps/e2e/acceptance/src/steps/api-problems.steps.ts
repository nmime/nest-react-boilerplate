import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import * as problemDetailsSource from '@app/common-problem-details';
import type { AcceptanceWorld } from '../support/world.ts';

// Executable acceptance evidence for REQ-API-PROBLEM-001.
const problemDetails =
  (
    problemDetailsSource as unknown as {
      default?: typeof problemDetailsSource;
    }
  ).default ?? problemDetailsSource;
const { problemInstanceForRequestId } = problemDetails;
Given('the valid request identifier {string}', function (this: AcceptanceWorld, requestId: string) {
  this.requestId = requestId;
});

Given('an unsafe request identifier', function (this: AcceptanceWorld) {
  this.requestId = '../private value';
});

When('a problem occurrence URI is created', function (this: AcceptanceWorld) {
  try {
    this.occurrenceUri = problemInstanceForRequestId(this.requestId ?? '');
  } catch (error) {
    this.occurrenceError = error;
  }
});

Then('the occurrence URI is absolute and contains {string}', function (this: AcceptanceWorld, identifier: string) {
  assert.equal(new URL(this.occurrenceUri ?? '').protocol, 'https:');
  assert.match(this.occurrenceUri ?? '', new RegExp(`${identifier}$`, 'u'));
});

Then('occurrence URI creation is rejected', function (this: AcceptanceWorld) {
  assert.ok(this.occurrenceError instanceof TypeError);
  assert.equal(this.occurrenceUri, undefined);
});
