export type UnilogFamily =
  | 'faucet'
  | 'fitting'
  | 'dishwasher'
  | 'lighting'
  | 'decking'
  | 'abrasive'
  | 'tool'
  | 'electrical'
  | 'other';

export type TaxonomyEntry = {
  family: UnilogFamily;
  classpath: string;
  dept: string;
  class: string;
  fine: string;
  productName: string;
};

const DEFAULT_TAXONOMY: Record<UnilogFamily, TaxonomyEntry> = {
  dishwasher: {
    family: 'dishwasher',
    classpath: 'Appliances & Consumer Electronics>Kitchen Appliances>Built-In Dishwashers',
    dept: 'Appliances',
    class: 'Large Appliances',
    fine: 'Dishwashers',
    productName: 'Dishwasher',
  },
  faucet: {
    family: 'faucet',
    classpath: 'Plumbing > Kitchen & Bath > Sink Faucets',
    dept: 'Plumbing',
    class: 'Faucets',
    fine: 'Kitchen Faucets',
    productName: 'Kitchen Faucet',
  },
  fitting: {
    family: 'fitting',
    classpath: 'Plumbing > Pipe / Tube / Hose Fittings',
    dept: 'Plumbing',
    class: 'Fittings',
    fine: 'Pipe Fittings',
    productName: 'Fitting',
  },
  lighting: {
    family: 'lighting',
    classpath: 'Lighting > Indoor Lighting > Light Fixtures',
    dept: 'Electrical',
    class: 'Lighting',
    fine: 'Fixtures',
    productName: 'Light Fixture',
  },
  decking: {
    family: 'decking',
    classpath: 'Building Materials > Exterior > Decking',
    dept: 'Building Materials',
    class: 'Decking',
    fine: 'Composite Decking',
    productName: 'Decking',
  },
  abrasive: {
    family: 'abrasive',
    classpath: 'Tools & Hardware > Abrasives > Discs & Belts',
    dept: 'Tools',
    class: 'Abrasives',
    fine: 'Sanding Discs & Belts',
    productName: 'Abrasive',
  },
  tool: {
    family: 'tool',
    classpath: 'Tools & Hardware > Power Tool Accessories',
    dept: 'Tools',
    class: 'Accessories',
    fine: 'Power Tool Accessories',
    productName: 'Tool Accessory',
  },
  electrical: {
    family: 'electrical',
    classpath: 'Electrical > Wiring Devices > Switches & Outlets',
    dept: 'Electrical',
    class: 'Wiring Devices',
    fine: 'Devices',
    productName: 'Electrical Device',
  },
  other: {
    family: 'other',
    classpath: 'General Merchandise > Unclassified',
    dept: 'General',
    class: 'Unclassified',
    fine: 'Other',
    productName: 'Product',
  },
};

export function detectFamily(partDesc: string, familyHint?: string | null): UnilogFamily {
  if (
    familyHint &&
    [
      'faucet',
      'fitting',
      'dishwasher',
      'lighting',
      'decking',
      'abrasive',
      'tool',
      'electrical',
      'other',
    ].includes(familyHint)
  ) {
    return familyHint as UnilogFamily;
  }

  const t = partDesc.toLowerCase();
  if (/dishwasher|frigidaire|pdsh/.test(t)) return 'dishwasher';
  if (
    /faucet|fauc|kit faucet|lav faucet|pulldn|pull-dn|pullout|touchless|centerset|widespread|gooseneck/.test(
      t,
    )
  ) {
    return 'faucet';
  }
  if (
    /\bcplg\b|coupling|\bell\b|elbow|\btee\b|reducer|adpt|adapter|union|\bcpl\b|npt|swt|sch40|sch80|150#/.test(
      t,
    )
  ) {
    return 'fitting';
  }
  if (/sand|disc|belt|grit|stikit|cubitron|abrasive|\bp\d{2,3}\b/.test(t)) return 'abrasive';
  if (/light|lamp|led|bulb|fixture|kichler|philips|luminaire/.test(t)) return 'lighting';
  if (/trex|timbertech|deck|railing|fascia/.test(t)) return 'decking';
  if (/dewalt|milwaukee|drill|bit|saw|blade|diablo/.test(t)) return 'tool';
  if (/leviton|outlet|switch|gfci|dimmer|wire|conduit/.test(t)) return 'electrical';
  return 'other';
}

export function classifyPartDesc(
  partDesc: string,
  familyHint?: string | null,
  taxonomy?: Partial<Record<UnilogFamily, TaxonomyEntry>>,
): {
  family: UnilogFamily;
  classpath: string;
  dept: string;
  className: string;
  fine: string;
  productName: string;
  confidence: number;
  needsReview: boolean;
} {
  const family = detectFamily(partDesc, familyHint);
  const tax = { ...DEFAULT_TAXONOMY, ...(taxonomy || {}) }[family] || DEFAULT_TAXONOMY.other;
  const hinted =
    familyHint &&
    ['faucet', 'fitting', 'dishwasher', 'lighting', 'decking', 'abrasive', 'tool', 'electrical'].includes(
      familyHint,
    );
  const confidence = hinted ? 0.99 : family === 'other' ? 0.45 : 0.78;
  return {
    family,
    classpath: tax.classpath,
    dept: tax.dept,
    className: tax.class,
    fine: tax.fine,
    productName: tax.productName,
    confidence,
    needsReview: family === 'other' || confidence < 0.6,
  };
}

/** @deprecated Prefer classifyPartDesc().family — kept for older faucet/fitting callers */
export type LegacyUnilogFamily = 'faucet' | 'fitting';
