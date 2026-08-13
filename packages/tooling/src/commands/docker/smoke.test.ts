// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { smokeProbes } from './smoke-probes.ts';

void describe('docker smoke probes', () => {
  void it('gates on markers a rebrand cannot move', () => {
    // Five of these probes used to match the shipped page copy -- 'User App', 'Admin App',
    // 'Nest React Boilerplate', 'A dependable home'. Every one of those is either rewritten from
    // VITE_PRODUCT_NAME at build time or supplied by an i18n catalog, so the gate was asserting
    // that nobody had renamed the product yet and would fail the day somebody did.
    const structural = /^(data-app="[a-z-]+"|[a-z-]+-(api|app)|\/_expo\/static\/js\/web\/|"[a-z]+":"[^"]+")$/u;

    for (const probe of smokeProbes) {
      assert.match(probe.marker, structural, `${probe.name} matches "${probe.marker}", which is copy a product owns`);
    }
  });

  void it('probes every published service before declaring the stack healthy', () => {
    const probedPorts = new Set(smokeProbes.map((probe) => probe.port));

    for (const port of ['adminApi', 'adminApp', 'authApi', 'landingApp', 'mobileApp', 'siteApp', 'userApi', 'userApp']) {
      assert.ok(probedPorts.has(port as (typeof smokeProbes)[number]['port']), `${port} is published but never probed`);
    }
  });

  void it('probes the backends before the frontends that proxy to them', () => {
    const tiers = smokeProbes.map((probe) => probe.tier);

    // The command starts the frontends only after the backend probes pass, so a frontend probe
    // ordered before a backend one would run against a stack that has not been started yet.
    assert.equal(tiers.lastIndexOf('backend') < tiers.indexOf('frontend'), true);
  });
});
