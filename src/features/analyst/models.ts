export function selectAnalystModel(message: string) {
  void message;
  return process.env.CARNALYS_ANALYST_MODEL ?? "gpt-5.6-luna";
}
