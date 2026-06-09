export const repeat = async (
  count: number,
  action: (index: number) => Promise<void> | void,
): Promise<void> => {
  for (let index = 0; index < count; index += 1) {
    await action(index);
  }
};
