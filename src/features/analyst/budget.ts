export class AnalystBudget {
  turns = 0;
  toolCalls = 0;

  constructor(readonly maximumTurns = 3, readonly maximumToolCalls = 4) {}

  startTurn() {
    if (this.turns >= this.maximumTurns) return false;
    this.turns += 1;
    return true;
  }

  reserveToolCalls(count: number) {
    if (!Number.isSafeInteger(count) || count < 0 || this.toolCalls + count > this.maximumToolCalls) return false;
    this.toolCalls += count;
    return true;
  }
}

