export function notificationFixtureDatabase(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('Notification runtime fixtures cannot run in production mode.');
  const selected = env.NRB_NOTIFY_TEST_DATABASE_URL;
  if (!selected) throw new Error('Set NRB_NOTIFY_TEST_DATABASE_URL to an explicitly owned loopback test database.');
  let url;
  try {
    url = new URL(selected);
  } catch {
    throw new Error('Notification fixture database configuration is invalid.');
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('Notification fixture database configuration is invalid.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    !/^[a-z0-9_]+$/u.test(database) ||
    !/(^|_)(test|dev|boilerplate)($|_)/u.test(database)
  ) {
    throw new Error('Notification fixtures require a loopback test/development database namespace.');
  }
  return url.toString();
}
