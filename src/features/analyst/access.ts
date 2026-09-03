export async function authenticateAnalystRequest<T>(loadUser: () => Promise<T>): Promise<T | null> {
  try {
    return await loadUser();
  } catch {
    return null;
  }
}

