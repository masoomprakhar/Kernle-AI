export type UnilogFamily = 'faucet' | 'fitting';

const FAUCET_HINTS = [
  'faucet', 'fauc', 'kit faucet', 'lav faucet', 'pulldn', 'pull-dn', 'pullout', 'touchless',
  'centerset', 'widespread', 'gooseneck', 'spout',
];
const FITTING_HINTS = [
  'cplg', 'coupling', 'ell', 'elbow', 'tee', 'red ', 'reducer', 'adpt', 'adapter',
  'union', 'cap ', 'plg', 'plug', 'npt', 'swt', 'sch40', 'sch80', '150#',
];

export function classifyPartDesc(
  partDesc: string,
  familyHint?: string | null,
): { family: UnilogFamily; classpath: string; confidence: number } {
  if (familyHint === 'faucet' || familyHint === 'fitting') {
    return {
      family: familyHint,
      classpath:
        familyHint === 'faucet'
          ? 'Plumbing > Kitchen & Bath > Sink Faucets'
          : 'Plumbing > Pipe / Tube / Hose Fittings',
      confidence: 0.99,
    };
  }

  const t = partDesc.toLowerCase();
  let faucetScore = 0;
  let fittingScore = 0;
  for (const h of FAUCET_HINTS) if (t.includes(h)) faucetScore += 1;
  for (const h of FITTING_HINTS) if (t.includes(h)) fittingScore += 1;

  if (fittingScore > faucetScore) {
    return {
      family: 'fitting',
      classpath: 'Plumbing > Pipe / Tube / Hose Fittings',
      confidence: Math.min(0.9, 0.55 + fittingScore * 0.1),
    };
  }
  return {
    family: 'faucet',
    classpath: 'Plumbing > Kitchen & Bath > Sink Faucets',
    confidence: Math.min(0.9, 0.55 + faucetScore * 0.1),
  };
}
