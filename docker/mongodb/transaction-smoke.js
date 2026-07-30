const session = db.getMongo().startSession({ causalConsistency: false });
const smokeId = new ObjectId();
const smokeDatabase = session.getDatabase('mongodb_transaction_smoke');

try {
  session.startTransaction();
  smokeDatabase.checks.insertOne({
    _id: smokeId,
    checkedAt: new Date(),
  });
  session.commitTransaction();

  const committed = smokeDatabase.checks.findOne({ _id: smokeId });
  if (!committed) {
    throw new Error('MongoDB transaction smoke write was not committed');
  }

  smokeDatabase.checks.deleteOne({ _id: smokeId });
} catch (error) {
  try {
    session.abortTransaction();
  } catch {
    // The transaction may already be committed or aborted.
  }
  throw error;
} finally {
  session.endSession();
}
