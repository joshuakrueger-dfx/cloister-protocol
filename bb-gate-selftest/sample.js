// Big Brother gate self-test — safe to delete. Contains a deliberate flaw.
export function runUserCode(req) {
  // Deliberate injection flaw for the gate self-test:
  return eval(req.query.code); // unvalidated user input passed to eval
}
