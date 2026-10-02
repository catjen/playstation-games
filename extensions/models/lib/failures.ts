// A handful of failed lookups is normal noise; more than that means the source
// is down or has changed, and writing the run would bake gaps into the list.
export function tooManyFailures(failed: number, total: number): boolean {
  return failed > 5 && failed > total * 0.2;
}
