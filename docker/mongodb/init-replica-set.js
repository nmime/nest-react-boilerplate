try {
  rs.status();
} catch (error) {
  if (error.code !== 94 && error.codeName !== 'NotYetInitialized') {
    throw error;
  }

  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongodb:27017' }],
  });
}
