let shouldInitialize = false;

try {
  rs.conf();
} catch (error) {
  if (error.code !== 94 && error.codeName !== 'NotYetInitialized') {
    throw error;
  }

  shouldInitialize = true;
}

if (shouldInitialize) {
  const result = rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: `mongodb:${process.env.MONGODB_PORT || '27017'}` }],
  });
  if (!result.ok) {
    throw new Error(`Replica-set initialization failed: ${JSON.stringify(result)}`);
  }
}
