import { buildStackImages, composeArgs, fullstackSelection, run, serviceUrls, upStack, waitForText } from './compose';
import { readinessProbes } from './selection';

export default async function globalSetup(): Promise<void> {
  if (!fullstackSelection) {
    throw new Error(
      'Managed fullstack setup requires a fresh selected closure; use the extended config for external URLs.',
    );
  }
  await run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans']);
  if (process.env.FULLSTACK_SKIP_BUILD !== 'true') {
    await buildStackImages();
  }
  await upStack();
  await Promise.all(
    readinessProbes(fullstackSelection).map((probe) =>
      waitForText(probe.service, `${serviceUrls[probe.service]}${probe.path}`, probe.marker),
    ),
  );
}
