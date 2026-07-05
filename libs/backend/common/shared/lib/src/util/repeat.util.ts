export const repeat = async (
  count: number,
  action: (index: number) => Promise<void> | void,
): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-await-in-loop -- actions run sequentially in index order by design
    await action(index);
  }
};
